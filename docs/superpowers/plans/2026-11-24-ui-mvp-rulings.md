# 계획 2 실행 기록: 판단과 남겨 둔 점

계획 2(도트 사무실 화면과 조작)를 실행하며 내린 판단(Ruling)과, 고치지 않고 다음 버전으로 넘긴 작은 점을 실행 기록에서 그대로 옮겼다.

## 판단 (Ruling)

- Ruling R1: Task 1 copy drafted by a writing subagent, sent to the user; Tasks 2, 4, 5 run meanwhile; 3, 6, 7, 8 wait — plan-mandated gate — cost if wrong: idle time.
- Ruling R2: Task 5 is pure data + canvas; its draw functions are verified by Task 9 screenshots, not unit tests — cost if wrong: visual bugs found later.
- Task 2: Ruling: controller commits for implementers (user approval is held by the controller; subagents decline to commit on relayed approval) — cost if wrong: none
- Task 6: Ruling: additive view fields in sim/game.js (people[].week, clients[].churnWorkdaysLeft, calendar 30 days, SEATS/HIRE_COST re-exports) accepted — UI may only import sim/game.js — cost if wrong: none (additive).
- Final fix wave: Ruling: additive  from sim/game.js accepted (like SEATS/HIRE_COST) — cost if wrong: none.
- Final fix wave: Ruling: additive export SHIFTS from sim/game.js accepted (like SEATS/HIRE_COST) — cost if wrong: none.

## 남겨 둔 작은 점 (deferred minor)

- Task 2: minor (deferred): createClock ignores now; clock starts at speed 0 (Task 8 must start it); dayEnded false on game-over day (Task 8 must save on game over); loose ±30 test tolerance.
- Task 4: minor (deferred): no test for actor removal when person leaves; break-spot reshuffle when someone ahead leaves; overflow fallback door → gone; no RED evidence; map legend/connectivity assertions thin. Clinic spot unused (sick go home).
- Task 5: minor (deferred): pose() uses module MAP not the map param; TILE_SPRITES only used by test (drawTile default draws floor silently); spriteCanvas without palette for person draws black; sparkle may overlap status bubble (check in Task 9 screenshots); 16×16 size not asserted for people/Miso.
- Task 3: minor (deferred): non-Hangul value endings always take no-받침 particle forms; build-done falls back to textNobody if doneText renders empty.
- Task 6: minor (deferred): emoji in topbar not in UI_TEXT; open hours duplicated in topbar; null fee text if client def missing; layout to verify in Task 9.
- Task 8: minor (deferred): no test for keyboard-only focus restore; autoPaused text not shown (only ⏸ pressed); overlapping hit-test order vs draw order; Miso intro skipped on broken save.
- Task 9: minor (deferred): check steps not individually guarded; base_url global; no traceback; Playwright not declared; game-over save shows start screen first (이어하기 → game over) — ruling: keep (player sees their save exists).
- Controller observations from screenshots (for final review triage): at 1280×720 the open panel sits below the fold (page scrolls vertically); late-shift people show "퇴근" before their shift starts; hiring tab says "채용할 수 있어요" while seats are full; inbox fills with repeated 금요일 휴무 요청.
- Final: minor (deferred): autoPaused text stays after answering until resume; burnout/absent people show 퇴근 before opening (health line explains); finished inbox items not collapsed (inbox.showOld unused); friday-off "근무표를 바꿔 준다" is a one-day absence; reputation copy promises offers; sim: idle play still wins (balance), friday-off asked weekly from every Friday-rest person.
