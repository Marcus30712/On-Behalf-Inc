#!/usr/bin/env python3
"""Browser check for On Behalf Inc: plays the page in headless Chrome.

    python3 tools/browser_check.py

Serves the repo root on a free local port and drives /usr/bin/google-chrome
through Playwright at 1280x720 and 1024x640: new game, 3x speed to game day 5,
no console or page errors, no raw template text, no sideways scroll, a click
at 1x, a choice answered, continue after reload, a game-over save, a long
inbox, every open panel fully on screen, an office expansion started from the
hiring tab and a weekend client's roster, metrics and Saturday hours, and both channel clients accepted and
staffed (v1.3), and the art preview page (v1.5). Screenshots go to tools/out/. Prints only failures; the last line is
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
PHONE = (390, 844)  # v2.1: the panel as a bottom sheet and the 휴식표 cards
TARGET_DAY = 5
SEED = 7  # fixed new-game seed for the page (the long-inbox save uses the same one)
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
    """Runs `body` with createGame/advance/save/view/act in scope; `game` is saved."""
    game_url = (ROOT / 'sim' / 'game.js').as_uri()
    events_url = (ROOT / 'sim' / 'events.js').as_uri()
    script = f"""
import {{ createGame, advance, save, view, act }} from {json.dumps(game_url)};
import {{ pushEvent }} from {json.dumps(events_url)};
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
    check_canvas_flush(page, tag)
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
    if size == VIEWPORTS[0]:
        check_card_breaks(page, tag)
        check_break_move(page, tag)
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
    # Push unread notices until the inbox is long, whatever the run produced.
    text = node_save('advance(game, 1440 * 30);'
                     "while (game.inbox.length < 20) pushEvent(game, { id: 'call-spike', clientId: view(game).clients[0].id });"
                     "if (game.gameOver) throw new Error('game ended');")
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


def check_expansion_weekend(browser):
    """v1.2: expansion from the hiring tab; a weekend client's screens."""
    tag = 'expansion+weekend'
    size = VIEWPORTS[1]  # the smaller screen: the busiest panels must still fit
    weekend = "game.clients.push({ id: 'baram-delivery', satisfaction: 70, active: true }); game.cash = 100000;"
    page = open_page(browser, size, node_save(weekend))
    page.click('.start-continue')
    page.wait_for_selector('.overlay', state='hidden')
    page.keyboard.press(' ')
    metric = page.locator('.metrics [data-client="baram-delivery"]')
    if '주말 운영' not in metric.inner_text():
        fail(f'{tag}: weekday metrics for the weekend client do not say 주말 운영: {metric.inner_text()!r}')

    page.click('[data-tab="hiring"]')
    page.wait_for_selector('.panel .office')
    page.click('[data-action="startExpansion"]')
    page.click('[data-action="confirmExpansion"]')
    page.wait_for_timeout(300)
    stage1 = page.locator('.office [data-stage="1"]').inner_text()
    if '공사 중' not in stage1:
        fail(f'{tag}: starting expansion 1 did not show it building: {stage1!r}')
    check_panel_visible(page, size, f'{tag} hiring')
    page.screenshot(path=str(OUT / 'office-expansion.png'))
    check_text(page, f'{tag} hiring')
    check_no_sideways(page, f'{tag} hiring')

    page.click('[data-tab="roster"]')
    page.wait_for_timeout(100)
    cols = page.locator('.roster thead th').count()
    if cols != 8 or page.locator('.roster tfoot [data-weekend-count]').count() != 2:
        fail(f'{tag}: roster with a weekend client has {cols} head cells (want 8) or no weekend counts')
    check_panel_visible(page, size, f'{tag} roster')
    page.screenshot(path=str(OUT / 'roster-weekend.png'))
    check_text(page, f'{tag} roster')
    check_no_sideways(page, f'{tag} roster')
    check_errors(page, tag)
    page.context.close()

    # Saturday 10:00 with the weekend client: open, numbers shown, 1x pace.
    page = open_page(browser, size, node_save(weekend + 'advance(game, 1440 * 5 + 600 - (game.day * 1440 + game.minute));'
                                              "if (game.gameOver) throw new Error('game ended');"))
    page.click('.start-continue')
    page.wait_for_selector('.overlay', state='hidden')
    page.keyboard.press(' ')
    if page.locator('.topbar .weekend-open').count() != 1 or page.locator('.topbar .shut').count() != 0:
        fail(f'{tag}: Saturday 10:00 top bar is not 주말 운영: {page.inner_text(".topbar .when")!r}')
    metric = page.locator('.metrics [data-client="baram-delivery"]')
    if '서비스 레벨' not in metric.inner_text():
        fail(f'{tag}: Saturday metrics for the weekend client show no numbers: {metric.inner_text()!r}')
    before = page.inner_text('.topbar .time')
    page.keyboard.press('1')
    page.clock.run_for(2000)
    page.keyboard.press(' ')
    after = page.inner_text('.topbar .time')
    mins = lambda t: int(t[:2]) * 60 + int(t[3:5])
    if mins(after) - mins(before) > 30:
        fail(f'{tag}: open Saturday ran at the fast rate at 1x ({before} -> {after} in 2 s)')
    page.screenshot(path=str(OUT / 'weekend-saturday.png'))
    check_text(page, f'{tag} saturday')
    check_errors(page, f'{tag} saturday')
    page.context.close()


def check_channels(browser):
    """v1.3: both desk researches done and both channel offers waiting; the
    player accepts them, puts an agent on each, and the metrics, clients tab
    and office show the chat and email clients."""
    tag = 'channels'
    size = VIEWPORTS[0]
    text = node_save("game.research.done.push('chat-desk', 'mail-desk'); game.cash = 100000;"
                     "for (const id of ['saebyeol-bank', 'solbang-books']) pushEvent(game, { id: 'client-offer', clientId: id, deadlineDay: game.day + 7 });"
                     "advance(game, Math.max(0, 600 - game.minute));"
                     "if (game.gameOver) throw new Error('game ended');")
    page = open_page(browser, size, text)
    page.click('.start-continue')
    page.wait_for_selector('.overlay', state='hidden')
    page.keyboard.press(' ')
    page.wait_for_timeout(200)
    for n in range(2):  # the two offers (their titles do not name the client)
        item = page.locator('.inbox-item.needs-answer[data-id="client-offer"]').first
        if item.count() == 0:
            fail(f'{tag}: only {n} channel offer(s) to answer')
            break
        index = item.get_attribute('data-index')
        if item.locator('.inbox-head').get_attribute('aria-expanded') != 'true':
            item.locator('.inbox-head').click()
        sel = f'.inbox-item[data-index="{index}"]'
        page.locator(f'{sel} .choice-btn', has_text='계약한다').click()
        try:
            page.wait_for_selector(f'{sel} .choice-result', timeout=3000)
        except Exception:
            fail(f'{tag}: accepting offer #{index} showed no result text')
    for cid, mark in [('saebyeol-bank', '💬 채팅'), ('solbang-books', '✉️ 이메일')]:
        chip = page.locator(f'.metrics [data-client="{cid}"]')
        if chip.count() == 0 or mark not in chip.inner_text():
            fail(f'{tag}: no metrics chip with {mark} for {cid}')

    # One agent at work now (전화 중 in the people tab) on each new client,
    # through the tasks tab's client choice.
    page.click('[data-tab="people"]')
    page.wait_for_selector('.panel .person-list')
    working = page.eval_on_selector_all('.person-list .person',
                                        "bs => bs.filter((b) => b.innerText.includes('전화 중')).map((b) => b.dataset.person)")
    page.click('[data-tab="tasks"]')
    page.wait_for_selector('.panel .tasks')
    if len(working) < 2:
        fail(f'{tag}: fewer than two people on the phone to move: {working}')
    else:
        for pid, cid in zip(working, ['saebyeol-bank', 'solbang-books']):
            page.select_option(f'select[data-field="client"][data-person="{pid}"]', cid)
            page.wait_for_timeout(100)
        page.click('[data-tab="people"]')
        page.wait_for_timeout(100)
        for pid, mark in zip(working, ['💬 채팅', '✉️ 이메일']):
            if mark not in page.inner_text(f'.person-list [data-person="{pid}"]'):
                fail(f'{tag}: {pid} moved to a {mark} client does not show {mark}')
        page.click('[data-tab="tasks"]')
        page.wait_for_selector('.panel .tasks')
    check_panel_visible(page, size, f'{tag} tasks')
    check_text(page, f'{tag} tasks')
    page.click('[data-tab="clients"]')
    page.wait_for_timeout(100)
    target = page.locator('.clients tr[data-client="solbang-books"]').inner_text()
    if '영업시간 12시간 안에 90.00%' not in target or '밀린 메일' not in target:
        fail(f'{tag}: the email row lacks its target or backlog: {target!r}')
    check_panel_visible(page, size, f'{tag} clients')
    check_text(page, f'{tag} clients')
    page.click('.panel-root .panel-close')

    # Let the hour run so mail and chats come in and the agents sit down.
    run_until(page, tag, lambda p: p.inner_text('.topbar .time') >= '11:00')
    page.keyboard.press('1')
    page.wait_for_timeout(2500)
    page.keyboard.press(' ')
    mail = page.locator('.metrics [data-client="solbang-books"]').inner_text()
    if '밀린 메일' not in mail or '기한 안 답장' not in mail:
        fail(f'{tag}: the email chip lacks backlog or on-time share: {mail!r}')
    box = page.locator('.metrics').bounding_box()
    if not box or box['y'] + box['height'] > size[1]:
        fail(f'{tag}: metrics pushed below the viewport: {box}')
    page.screenshot(path=str(OUT / 'channels.png'))
    check_text(page, tag)
    check_no_sideways(page, tag)
    check_errors(page, tag)
    page.context.close()


def check_metrics_fit(browser):
    """v1.4: with 5 and with 7 active clients the page still fits 1280x720
    (no vertical scroll) and the whole tab bar is on screen."""
    size = VIEWPORTS[0]
    phone = ['dalbit-mall', 'bandi-repair', 'baram-delivery']
    cases = [('clients-5', phone), ('clients-7', phone + ['saebyeol-bank', 'solbang-books'])]
    for name, ids in cases:
        tag = f'metrics fit {name}'
        push = ''.join(f"game.clients.push({{ id: '{i}', satisfaction: 70, active: true }});" for i in ids)
        text = node_save(push + "advance(game, Math.max(0, 660 - game.minute));"
                         "if (game.gameOver) throw new Error('game ended');")
        page = open_page(browser, size, text)
        page.click('.start-continue')
        page.wait_for_selector('.overlay', state='hidden')
        page.keyboard.press(' ')
        page.wait_for_timeout(200)
        chips = page.locator('.metrics .metric').count()
        if chips != len(ids) + 2:
            fail(f'{tag}: {chips} metric chips, want {len(ids) + 2}')
        sh = page.evaluate('document.documentElement.scrollHeight')
        if sh > size[1]:
            fail(f'{tag}: page is {sh - size[1]} px taller than the viewport (scrollHeight {sh})')
        box = page.locator('.tabs').bounding_box()
        if not box or box['y'] < 0 or box['y'] + box['height'] > size[1]:
            fail(f'{tag}: tab bar not fully inside the viewport: {box}')
        page.screenshot(path=str(OUT / f'{name}.png'))
        check_text(page, tag)
        check_no_sideways(page, tag)
        check_errors(page, tag)
        page.context.close()


BREAKS_LINE_RE = re.compile(r'^휴식 \d\d:\d\d · 점심 \d\d:\d\d · 휴식 \d\d:\d\d$')


def check_break_move(page, tag):
    """v1.9: the 휴식표 tab shows bars and moves a break 15 minutes on ▶."""
    page.click('[data-tab="breaks"]')
    page.wait_for_selector('.panel-root .break-chart')
    if page.locator('.panel-root .break-slot').count() == 0:
        fail(f'{tag}: 휴식표 has no forecast bars')
        return
    button = page.locator('.panel-root table.breaks button[data-step="later"]:not([disabled])').first
    if button.count() == 0:
        fail(f'{tag}: 휴식표 has no movable break')
        return
    cell = button.locator('xpath=..')
    before = cell.locator('.break-time').text_content()
    pid = button.evaluate("b => b.closest('tr').dataset.person")
    kind = button.evaluate("b => b.closest('td').dataset.break")
    button.click()
    page.wait_for_timeout(150)
    after = page.locator(f'.panel-root tr[data-person="{pid}"] td[data-break="{kind}"] .break-time').text_content()
    bh, bm = map(int, before.split(':'))
    ah, am = map(int, after.split(':'))
    if (ah * 60 + am) - (bh * 60 + bm) != 15:
        fail(f'{tag}: 휴식표 ▶ moved {kind} of {pid} from {before} to {after}, not 15 minutes later')
    if '직접 조정' not in page.locator(f'.panel-root tr[data-person="{pid}"]').text_content():
        fail(f'{tag}: 휴식표 row of {pid} is not marked 직접 조정 after a move')
    page.screenshot(path=str(OUT / 'breaks-moved.png'))


def check_canvas_flush(page, tag):
    """v2.2: the office drawing starts at the top of its frame (the panel's
    section.office style used to push the canvas down by 21px)."""
    stage = page.locator('.stage').bounding_box()
    canvas = page.locator('.stage canvas').bounding_box()
    if abs(canvas['y'] - stage['y']) > 1:
        fail(f'{tag}: the office drawing starts {canvas["y"] - stage["y"]:.0f}px below its frame')


def check_phone(browser):
    """v2.1: on a phone every tab's panel opens full width without pushing the
    page sideways, and the 휴식표 shows as cards with 44px buttons that move a
    break 15 minutes."""
    tag = where(PHONE)
    page = open_page(browser, PHONE)
    # The start screen covers everything: the fixed tab bar must not be tappable through it.
    hit = page.evaluate("""() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight - 20);
                                       return e && e.closest('.tabs') ? e.outerHTML.slice(0, 60) : null; }""")
    if hit:
        fail(f'{tag}: a tab is tappable through the start screen: {hit}')
    new_game(page)
    page.keyboard.press(' ')  # pause: the sheet stays still while we look
    # v2.2: one column — the office fills the width, the inbox then the metrics below it.
    check_canvas_flush(page, tag)
    canvas = page.locator('.stage canvas').bounding_box()
    inbox = page.locator('aside.inbox').bounding_box()
    metrics = page.locator('.metrics').bounding_box()
    if abs(canvas['width'] - PHONE[0]) > 1:
        fail(f'{tag}: the office is {canvas["width"]:.0f}px wide, not the screen width')
    # The inbox (decisions with deadlines) comes right after the office, before the metrics.
    if not (inbox['y'] >= canvas['y'] + canvas['height'] - 1 and metrics['y'] >= inbox['y'] + inbox['height'] - 1):
        fail(f'{tag}: not office, inbox, metrics from top to bottom: {canvas} {inbox} {metrics}')
    if abs(inbox['width'] - PHONE[0]) > 1:
        fail(f'{tag}: the inbox is {inbox["width"]:.0f}px wide, not the screen width')
    check_no_sideways(page, f'{tag} main')
    # A tap just beside a person on the small office still opens their card.
    page.evaluate("""() => { const c = document.querySelector('.stage canvas'); c.scrollIntoView(); }""")
    # A tap just right of a seated person (beyond the sprite, within half a
    # tile) opens their card: let people walk to their seats first.
    page.keyboard.press('1')
    page.clock.run_for(4000)  # 24 game minutes at 1x: everyone at their seat
    page.keyboard.press(' ')
    seats = page.evaluate("""async () => (await import('./render/map.js')).MAP.spots.seats""")
    scale = canvas['width'] / 960
    opened = False
    for sx, sy in seats:
        x = canvas['x'] + (sx * 48 + 48 + 12) * scale  # 12 canvas px right of the sprite box
        y = canvas['y'] + (sy * 48 + 24) * scale
        page.mouse.click(x, y)
        page.wait_for_timeout(80)
        if page.locator('.panel-root .person-card, .panel-root [data-card]').count() or page.locator('[data-tab="people"][aria-selected="true"]').count():
            opened = True
            break
    if not opened:
        fail(f'{tag}: a tap beside a seated person did not open their card')
    if page.locator('[data-tab="people"][aria-selected="true"]').count():
        page.click('[data-tab="people"]')  # close
    page.screenshot(path=str(OUT / 'phone-main.png'))
    tabs = page.eval_on_selector_all('[data-tab]', 'els => els.map(e => e.dataset.tab)')
    for tab in tabs:
        page.click(f'[data-tab="{tab}"]')
        page.wait_for_selector('.panel-root .panel')
        box = page.locator('.panel-root .panel').bounding_box()
        if not box or abs(box['width'] - PHONE[0]) > 1 or box['y'] + box['height'] > PHONE[1] + 1:
            fail(f'{tag} {tab}: panel is not a full-width sheet on screen: {box}')
        check_no_sideways(page, f'{tag} {tab}')
        top = page.locator('.topbar').bounding_box()
        if box and top and box['y'] < top['y'] + top['height'] - 1:
            fail(f'{tag} {tab}: the sheet covers the top bar (sheet top {box["y"]:.0f} < top bar bottom {top["y"] + top["height"]:.0f})')
        if tab == 'roster':
            # Names stay on one line; a wide table scrolls sideways inside the sheet instead.
            lines = page.eval_on_selector_all('.panel-root tbody th[scope="row"]', """ths => ths.map(th => {
                const r = document.createRange(); r.selectNodeContents(th.firstChild);
                return new Set([...r.getClientRects()].map(x => Math.round(x.top))).size; })""")
            if any(n > 1 for n in lines):
                fail(f'{tag}: 근무표 names wrap onto {max(lines)} lines')
        if not page.locator('.panel-root .panel-close').is_visible():
            fail(f'{tag} {tab}: panel close button not visible')
        if tab == 'breaks':
            if page.locator('.panel-root table.breaks thead').is_visible():
                fail(f'{tag}: 휴식표 header row still shown on a phone')
            for b in page.locator('.panel-root table.breaks button[data-step]').all()[:6]:
                bb = b.bounding_box()
                if not bb or bb['height'] < 44 or bb['width'] < 44:
                    fail(f'{tag}: 휴식표 button smaller than 44x44: {bb}')
                    break
            button = page.locator('.panel-root table.breaks button[data-step="later"]:not([disabled])').first
            pid = button.evaluate("b => b.closest('tr').dataset.person")
            kind = button.evaluate("b => b.closest('td').dataset.break")
            cell = f'.panel-root tr[data-person="{pid}"] td[data-break="{kind}"] .break-time'
            before = page.locator(cell).text_content()
            button.click()
            page.wait_for_timeout(150)
            after = page.locator(cell).text_content()
            bh, bm = map(int, before.split(':'))
            ah, am = map(int, after.split(':'))
            if (ah * 60 + am) - (bh * 60 + bm) != 15:
                fail(f'{tag}: 휴식표 ▶ moved {kind} of {pid} from {before} to {after}, not 15 minutes later')
            page.screenshot(path=str(OUT / 'phone-breaks.png'))
        page.click(f'[data-tab="{tab}"]')  # close
    # v2.2.1: the tab bar shows there is more to the right, and a tab chosen off
    # screen scrolls into view.
    has_more = lambda: page.evaluate("document.querySelector('.tabs').classList.contains('more-right')")
    page.evaluate("document.querySelector('.tabs').scrollLeft = 0")  # the loop above left it at the end
    page.wait_for_timeout(150)
    if not has_more():
        fail(f'{tag}: the overflowing tab bar does not show there are more tabs')
    last = page.eval_on_selector_all('.tabs [data-tab]', 'els => els.at(-1).dataset.tab')
    page.evaluate(f"document.querySelector('.tabs [data-tab=\"{last}\"]').click()")
    page.wait_for_timeout(400)
    r = page.locator(f'.tabs [data-tab="{last}"]').bounding_box()
    if not r or r['x'] < 0 or r['x'] + r['width'] > PHONE[0] + 1:
        fail(f'{tag}: the chosen tab {last} is not scrolled into view: {r}')
    if has_more():
        fail(f'{tag}: at the end of the tab bar it still shows more tabs to the right')
    page.click(f'.tabs [data-tab="{last}"]')  # close
    check_errors(page, tag)
    page.context.close()
    check_phone_channels(browser)


def check_phone_channels(browser):
    """v2.2.1: on a phone a client's channel sits on its name's line, the numbers below."""
    tag = f'{where(PHONE)} channels'
    text = node_save("game.research.done.push('chat-desk', 'mail-desk'); game.cash = 100000;"
                     "for (const id of ['saebyeol-bank', 'solbang-books']) pushEvent(game, { id: 'client-offer', clientId: id, deadlineDay: game.day + 7 });"
                     "for (const e of view(game).inbox.filter((x) => x.id === 'client-offer' && !x.choice)) act(game, { type: 'resolve', index: e.index, choiceId: 'accept' });"
                     "advance(game, Math.max(0, 600 - game.minute));"
                     "if (game.gameOver) throw new Error('game ended');")
    page = open_page(browser, PHONE, text)
    page.click('.start-continue')
    page.wait_for_selector('.overlay', state='hidden')
    page.keyboard.press(' ')
    rows = page.eval_on_selector_all('.metrics .metric', """els => els.map(li => {
        const name = li.querySelector('strong').getBoundingClientRect();
        const ch = li.querySelector('.channel')?.getBoundingClientRect();
        const num = li.querySelector(':scope > span:not(.channel)')?.getBoundingClientRect();
        return { id: li.dataset.client, name: Math.round(name.top), ch: ch && Math.round(ch.top), num: num && Math.round(num.top) };
    })""")
    if not any(r['ch'] is not None for r in rows):
        fail(f'{tag}: no channel labels on the metrics')
    for r in rows:
        if r['ch'] is not None and abs(r['ch'] - r['name']) > 2:
            fail(f'{tag}: {r["id"]}: the channel is not on the name line ({r})')
        if r['num'] is not None and r['num'] <= r['name'] + 2:
            fail(f'{tag}: {r["id"]}: the numbers are not below the name ({r})')
    check_no_sideways(page, tag)
    page.screenshot(path=str(OUT / 'phone-channels.png'))
    check_errors(page, tag)
    page.context.close()


def check_card_breaks(page, tag):
    """v1.6: a working person's card shows the 오늘 휴식 row with three times."""
    page.click('[data-tab="people"]')
    page.wait_for_timeout(100)
    ids = page.eval_on_selector_all('.panel-root .person', 'bs => bs.map((b) => b.dataset.person)')
    for pid in ids:
        page.click(f'.panel-root .person[data-person="{pid}"]')
        page.wait_for_selector('.panel-root .card')
        line = page.evaluate("""() => {
            const dt = [...document.querySelectorAll('.panel-root .card dt')].find((d) => d.textContent === '오늘 휴식');
            return dt ? dt.nextElementSibling.textContent : null;
        }""")
        if line is None:
            fail(f'{tag}: card of {pid} has no 오늘 휴식 row')
            return
        if BREAKS_LINE_RE.match(line):
            check_panel_visible(page, VIEWPORTS[0], f'{tag} card')
            page.screenshot(path=str(OUT / 'card-breaks.png'))
            check_text(page, f'{tag} card')
            page.click('.panel-root .card .back')
            return
        if line != '오늘은 근무가 없어요.':
            fail(f'{tag}: card of {pid} shows {line!r} for 오늘 휴식')
        page.click('.panel-root .card .back')
    fail(f'{tag}: nobody at work shows a 오늘 휴식 line')


def shoot_preview(browser):
    """The art preview page (render/preview.html): office level 0, expansion 1
    building and level 2 with every seat taken, and Kim Miso, one picture each."""
    tag = 'preview'
    page = browser.new_context(viewport={'width': 1000, 'height': 800}).new_page()
    page.errors = []
    page.on('console', lambda m: m.type == 'error' and page.errors.append(f'console: {m.text}'))
    page.on('pageerror', lambda e: page.errors.append(f'pageerror: {e}'))
    page.goto(base_url.split('index.html')[0] + 'render/preview.html')
    page.wait_for_timeout(500)
    for cid, name in [('before', 'office-level0'), ('after', 'office-building-level1'),
                      ('full', 'office-level2'), ('miso', 'miso')]:
        page.locator(f'#{cid}').screenshot(path=str(OUT / f'{name}.png'))
    check_errors(page, tag)
    page.context.close()


def main():
    global base_url
    OUT.mkdir(parents=True, exist_ok=True)
    server = serve()
    base_url = f'http://127.0.0.1:{server.server_address[1]}/index.html?seed={SEED}'  # ?seed= is test-only
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=CHROME, headless=True)
            try:
                for size in VIEWPORTS:
                    play_viewport(browser, size)
                check_game_over(browser)
                check_long_inbox(browser)
                check_expansion_weekend(browser)
                check_channels(browser)
                check_metrics_fit(browser)
                check_phone(browser)
                shoot_preview(browser)
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
