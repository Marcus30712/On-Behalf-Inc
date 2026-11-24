#!/usr/bin/env python3
"""Browser check for On Behalf Inc: plays the page in headless Chrome.

    python3 tools/browser_check.py

Serves the repo root on a free local port and drives /usr/bin/google-chrome
through Playwright at 1280x720 and 1024x640: new game, 3x speed to game day 5,
no console or page errors, no raw template text, no sideways scroll, a click
at 1x, a choice answered, continue after reload, a game-over save, a long
inbox, every open panel fully on screen. Screenshots go to tools/out/. Prints only failures; the last line is
ALL CHECKS PASSED when there are none.
"""
import functools
import http.server
import json
import re
import subprocess
import sys
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'tools' / 'out'
CHROME = '/usr/bin/google-chrome'
SAVE_KEY = 'on-behalf-inc:save:v1'
VIEWPORTS = [(1280, 720), (1024, 640)]
TARGET_DAY = 5
RUN_STEP_MS = 500  # page time run per poll at 3x (frames fire every 16 ms)
DAYS_PER_MONTH = 30
DAYS_PER_YEAR = 360
BAD_TEXT = ['{', 'undefined', 'NaN', 'null', 'false', 'true']
DATE_RE = re.compile(r'(\d+)년차 (\d+)월 (\d+)일')

failures = []


def fail(msg):
    failures.append(msg)
    print(f'FAIL: {msg}', flush=True)


# ---- local server ------------------------------------------------------------

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


# ---- saves made by the sim itself (Node) ---------------------------------------

def node_save(body):
    """Runs `body` with createGame/advance/save/view in scope; `game` is saved."""
    game_url = (ROOT / 'sim' / 'game.js').as_uri()
    script = f"""
import {{ createGame, advance, save, view }} from {json.dumps(game_url)};
const store = {{ text: null, setItem(k, v) {{ this.text = v; }}, getItem() {{ return this.text; }} }};
const game = createGame(7);
{body}
if (!save(game, store)) throw new Error('save failed');
process.stdout.write(store.text);
"""
    out = subprocess.run(['node', '--input-type=module', '-e', script],
                         capture_output=True, text=True, check=True, cwd=ROOT)
    return out.stdout


def seed_storage(context, text):
    context.add_init_script(
        f'if (!sessionStorage.getItem("seeded")) {{ localStorage.setItem({json.dumps(SAVE_KEY)}, {json.dumps(text)}); '
        'sessionStorage.setItem("seeded", "1"); }')


# ---- page helpers ------------------------------------------------------------

def open_page(browser, size, save_text=None):
    context = browser.new_context(viewport={'width': size[0], 'height': size[1]})
    if save_text is not None:
        seed_storage(context, save_text)
    page = context.new_page()
    page.clock.install()  # time flows as usual; run_until() fast-forwards it
    page.errors = []
    page.on('console', lambda m: m.type == 'error' and page.errors.append(f'console: {m.text} ({m.location.get("url")})'))
    page.on('response', lambda r: r.status >= 400 and page.errors.append(f'http {r.status}: {r.url}'))
    page.on('pageerror', lambda e: page.errors.append(f'pageerror: {e}'))
    page.goto(base_url)
    page.wait_for_selector('.overlay:not([hidden]) .screen, .overlay:not([hidden]) .intro')
    return page


def where(size):
    return f'{size[0]}x{size[1]}'


def check_errors(page, tag):
    for e in page.errors:
        fail(f'{tag}: {e}')
    page.errors.clear()


def check_text(page, tag):
    text = page.evaluate('document.body.innerText')
    for bad in BAD_TEXT:
        if bad in text:
            i = text.index(bad)
            fail(f'{tag}: page text contains {bad!r}: ...{text[max(0, i - 40):i + 40]!r}...')


def check_no_sideways(page, tag):
    sw, iw = page.evaluate('[document.documentElement.scrollWidth, innerWidth]')
    if sw > iw:
        fail(f'{tag}: horizontal overflow (scrollWidth {sw} > innerWidth {iw})')


def game_day(page):
    m = DATE_RE.search(page.inner_text('.topbar .date'))
    if not m:
        return None
    y, mo, d = map(int, m.groups())
    return (y - 1) * DAYS_PER_YEAR + (mo - 1) * DAYS_PER_MONTH + (d - 1)


def speed(page):
    return int(page.get_attribute('.topbar .speed[aria-pressed="true"]', 'data-speed'))


def new_game(page):
    page.click('.start-new')
    if page.is_visible('.confirm-yes'):
        page.click('.confirm-yes')
    page.wait_for_selector('.intro-skip, .start-play, .overlay[hidden]', state='attached')
    if page.is_visible('.intro-skip'):
        page.click('.intro-skip')
    page.wait_for_selector('.overlay', state='hidden')


def is_open_hours(page):
    """Weekday opening hours: the top bar shows no closed/weekend note."""
    return page.locator('.topbar .shut').count() == 0


def answer_choice(page, tag):
    item = page.locator('.inbox-item.needs-answer').first
    index = item.get_attribute('data-index')
    item.locator('.inbox-head').click()
    sel = f'.inbox-item[data-index="{index}"]'
    page.locator(f'{sel} .choice-btn').first.click()
    try:
        page.wait_for_selector(f'{sel} .choice-result', timeout=3000)
    except Exception:
        fail(f'{tag}: answering choice event #{index} showed no result text')
        return False
    return True


def run_until(page, tag, done, limit_s=300, on_pause=None):
    """Keeps the game at 3x until done(page); a choice event's auto-pause is
    handed to on_pause (or simply resumed)."""
    page.keyboard.press('3')
    deadline = time.time() + limit_s
    while not done(page):
        if time.time() > deadline:
            fail(f'{tag}: timed out (game day {game_day(page)})')
            return False
        if page.is_visible('.game-over'):
            fail(f'{tag}: game over while running')
            return False
        if speed(page) == 0:
            if on_pause:
                on_pause(page)
            page.keyboard.press('3')
        page.clock.run_for(RUN_STEP_MS)
    return True


# ---- checks ------------------------------------------------------------------

def check_click_at_1x(page, tag):
    """A panel button clicked while the game runs at 1x takes effect."""
    page.keyboard.press('1')
    page.click('[data-tab="research"]')
    btn = page.locator('[data-action="startResearch"]').first
    rid = btn.get_attribute('data-id')
    page.wait_for_timeout(600)  # let a few refreshes go by
    btn.click()
    page.wait_for_timeout(600)
    li = page.locator(f'.research[data-research="{rid}"]')
    if li.locator('[data-action="startResearch"]').count() != 0 or li.locator('progress').count() == 0:
        fail(f'{tag}: clicking start research at 1x did not start {rid}')
    page.click('[data-tab="research"]')  # close


def check_panel_visible(page, size, tag):
    """The open panel is fully on screen without scrolling the page."""
    scroll_y = page.evaluate('scrollY')
    box = page.locator('.panel-root .panel').bounding_box()
    vw, vh = size
    if scroll_y != 0 or not box or box['y'] < 0 or box['y'] + box['height'] > vh or box['x'] + box['width'] > vw:
        fail(f'{tag}: open panel not fully in the viewport (scrollY {scroll_y}): {box}')
    if not page.locator('.panel-root .panel-close').is_visible():
        fail(f'{tag}: panel close button not visible')


def play_viewport(browser, size):
    tag = where(size)
    page = open_page(browser, size)
    new_game(page)
    if size == VIEWPORTS[0]:
        check_click_at_1x(page, tag)

    answered = []

    def on_pause(p):
        if not answered and p.locator('.inbox-item.needs-answer').count():
            answered.append(answer_choice(p, tag))
            p.screenshot(path=str(OUT / f'inbox-answered-{tag}.png'))

    run_until(page, tag, lambda p: (game_day(p) or 0) >= TARGET_DAY, on_pause=on_pause)
    page.keyboard.press('1')
    if not answered:
        # no auto-pause came: answer any open choice now
        if page.locator('.inbox-item.needs-answer').count():
            answer_choice(page, tag)
        else:
            fail(f'{tag}: no choice event to answer by day {TARGET_DAY}')

    # working hours, people seated
    run_until(page, tag, lambda p: is_open_hours(p) and p.inner_text('.topbar .time') >= '11:00')
    page.keyboard.press('1')
    page.wait_for_timeout(2500)  # walkers reach their seats
    page.keyboard.press(' ')
    page.screenshot(path=str(OUT / f'office-{tag}.png'))
    check_errors(page, tag)
    check_text(page, tag)
    check_no_sideways(page, tag)

    if size == VIEWPORTS[0]:
        box = page.locator('.stage canvas').bounding_box()
        vw, vh = size
        if not (box and box['x'] >= 0 and box['y'] >= 0 and box['x'] + box['width'] <= vw and box['y'] + box['height'] <= vh):
            fail(f'{tag}: office canvas not fully visible: {box}')

    for name in page.eval_on_selector_all('[data-tab]', 'bs => bs.map((b) => b.dataset.tab)'):
        page.click(f'[data-tab="{name}"]')
        page.wait_for_timeout(100)
        check_panel_visible(page, size, f'{tag} tab {name}')
        page.screenshot(path=str(OUT / f'tab-{name}-{tag}.png'), full_page=True)
        check_text(page, f'{tag} tab {name}')
        check_no_sideways(page, f'{tag} tab {name}')
    page.click('.panel-root .panel-close')  # close the last one
    if page.locator('.panel-root .panel').count() != 0:
        fail(f'{tag}: the close button did not close the panel')

    first = page.locator('.inbox-item .inbox-head').first
    if first.get_attribute('aria-expanded') != 'true':
        first.click()
    page.wait_for_selector('.inbox-body')
    page.screenshot(path=str(OUT / f'inbox-open-{tag}.png'))
    check_text(page, f'{tag} inbox open')

    # reload -> continue shows the same date
    before = DATE_RE.search(page.inner_text('.topbar .date')).group(0)
    page.reload()
    page.wait_for_selector('.start-continue')
    page.click('.start-continue')
    page.wait_for_selector('.overlay', state='hidden')
    after = DATE_RE.search(page.inner_text('.topbar .date')).group(0)
    if before != after:
        fail(f'{tag}: continue after reload shows {after}, was {before}')
    check_errors(page, tag)
    page.context.close()


def check_game_over(browser):
    tag = 'game over'
    text = node_save("game.gameOver = { kind: 'game-over-cash', day: game.day };")
    page = open_page(browser, VIEWPORTS[0], text)
    page.click('.start-continue')  # the start screen offers the ended game; continuing opens it
    try:
        page.wait_for_selector('.overlay:not([hidden]) .game-over', timeout=3000)
    except Exception:
        fail(f'{tag}: a game-over save did not show the game-over screen')
    page.screenshot(path=str(OUT / 'game-over.png'))
    check_text(page, tag)
    check_errors(page, tag)
    page.context.close()


def check_long_inbox(browser):
    tag = 'long inbox'
    text = node_save('advance(game, 1440 * 30);'
                     "if (view(game).inbox.length < 20 || game.gameOver) throw new Error('need a long inbox');")
    size = VIEWPORTS[0]
    page = open_page(browser, size, text)
    page.click('.start-continue')
    page.wait_for_selector('.overlay', state='hidden')
    page.keyboard.press(' ')
    page.wait_for_timeout(300)
    for sel in ['.metrics', '.tabs']:
        box = page.locator(sel).bounding_box()
        if not box or box['y'] + box['height'] > size[1]:
            fail(f'{tag}: {sel} pushed below the viewport: {box}')
    page.click('[data-tab="people"]')
    page.wait_for_timeout(100)
    check_panel_visible(page, size, tag)
    page.screenshot(path=str(OUT / 'long-inbox.png'))
    check_text(page, tag)
    check_no_sideways(page, tag)
    check_errors(page, tag)
    page.context.close()


def main():
    global base_url
    OUT.mkdir(parents=True, exist_ok=True)
    server = serve()
    base_url = f'http://127.0.0.1:{server.server_address[1]}/index.html'
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=CHROME, headless=True)
            try:
                for size in VIEWPORTS:
                    play_viewport(browser, size)
                check_game_over(browser)
                check_long_inbox(browser)
            finally:
                browser.close()
    except Exception as e:  # a broken step is a failure, not a crash
        fail(f'check aborted: {type(e).__name__}: {e}')
    finally:
        server.shutdown()
    if failures:
        print(f'{len(failures)} check(s) failed')
        sys.exit(1)
    print('ALL CHECKS PASSED')


if __name__ == '__main__':
    main()
