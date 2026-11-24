# On Behalf Inc — 화면 문구 (UI 문안)

상태: 승인 2026-11-24
승인 때 정한 것: 연구는 돈 없이 연구 점수(사람의 시간)만 쓴다. 기술 이름은 응대·시스템·코칭·평가. 자동 처리 문구의 "(으)로"는 코드가 받침을 보고 "으로/로"로 바꾼다. `activity.idle`은 "대기".

- 날짜: 2026-11-24
- 쓰임: 계획 2(`2026-11-24-ui-mvp.md`) Task 1의 결과물. 승인되면 Task 3이 이 문구를 `UI_TEXT`로 그대로 옮긴다.
- 읽는 법: 표마다 맨 왼쪽 칸이 영문 키(코드에서 쓰는 이름)다. 키는 그대로 두고 **한국어 문구만** 고쳐 주면 된다. "메모" 칸은 화면에서 어떻게 쓰이는지 설명이며, 화면에는 나오지 않는다.
- 자리표시: `{name}` 사람 이름, `{client}` 고객사 이름, `{research}` 연구 이름, `{holiday}` 휴일 이름, `{nation}` 나라 이름, `{choice}` 선택지 문구, `{n}` 숫자, `{days}` 날 수, `{hours}` 시간, `{cost}` 금액, `{date}` 날짜.
- 세계관 이름(엘로반, 벨토라, 카무엔, 고객사·연구·특성·사건 이름)은 승인된 세계관 문안(`2026-11-24-on-behalf-inc-copy.md`)을 그대로 쓴다. 이 문서에서는 다시 쓰지 않는다.
- 숫자는 모두 가상 값이다.

---

## 1. 위쪽 바 (`topbar`)

### 1.1 날짜와 시각

| 키 | 문구 | 메모 |
|---|---|---|
| `topbar.date` | {year}년차 {month}월 {day}일 ({weekday}) | 예: 3년차 4월 12일 (화). 요일은 월화수목금토일(승인된 B안) |
| `topbar.time` | {hh}:{mm} | 예: 10:30 |
| `topbar.closed` | 영업 끝 | 영업 시간(평일 09:00~21:00) 밖일 때 시각 옆에 작게. 이때 시간이 빨리 흐름 |
| `topbar.weekend` | 주말 휴무 | 쉼날·빛날(토·일) |

### 1.2 속도 버튼

| 키 | 버튼 | 툴팁 (마우스를 올리면) |
|---|---|---|
| `speed.0` | ⏸ | 일시정지 (스페이스) |
| `speed.1` | ▶ | 보통 속도 (1) |
| `speed.2` | ▶▶ | 2배 빠르게 (2) |
| `speed.3` | ▶▶▶ | 3배 빠르게 (3) |
| `speed.resume` | — | 다시 시작 (스페이스) — 멈춰 있을 때 ⏸ 툴팁 대신 |
| `speed.autoPaused` | 답을 기다려요 | 선택지 있는 알림이 와서 시계가 저절로 멈췄을 때 속도 버튼 옆에 |

### 1.3 돈과 평판

| 키 | 문구 | 메모 |
|---|---|---|
| `topbar.cash` | 돈 | 아이콘 💰 옆 숫자. 예: 💰 12,400 |
| `topbar.cashTip` | 센터 통장 잔액. 월말에 계약금이 들어오고 급여가 나가요. 0 아래로 내려가면 문을 닫아요. | 툴팁 |
| `topbar.cashLow` | 돈이 얼마 안 남았어요 | 다음 달 급여보다 적을 때 숫자를 빨갛게 하고 툴팁에 추가 |
| `topbar.reputation` | 평판 | 아이콘 ⭐ 옆 등급. 예: ⭐ B |
| `topbar.reputationTip` | 서비스 레벨 목표를 얼마나 지켰는지와 고객사 만족도로 정해져요. | 툴팁 첫 줄. 둘째 줄에 아래 등급 설명 |

### 1.4 평판 등급 설명 (`grade`)

| 키 | 등급 | 설명 |
|---|---|---|
| `grade.S` | S | 최고예요. 새 고객사들이 먼저 찾아와요. |
| `grade.A` | A | 아주 좋아요. 제안이 들어오기 시작해요. |
| `grade.B` | B | 괜찮아요. 고객사들이 믿고 맡겨요. |
| `grade.C` | C | 불안해요. 목표를 놓치는 날이 잦아요. |
| `grade.D` | D | 위험해요. 고객사가 떠날 수 있어요. |

> 참고: 코드에서는 S·A가 이어지면 새 고객사 제안이 온다. 그래서 A 설명에 "제안"을 넣었다.

---

## 2. 고객사 지표 줄 (`metrics`)

화면 아래, 탭 바로 위에 고객사마다 한 줄. 예: `구름다리 여행  서비스 레벨 82% (목표 80%)  평균 대기 14초  포기 3  만족도 76`

| 키 | 문구 | 메모 |
|---|---|---|
| `metrics.serviceLevel` | 서비스 레벨 | 줄 안에서는 공간이 좁으면 `SL`로 줄여도 됨 |
| `metrics.serviceLevelShort` | SL | |
| `metrics.asa` | 평균 대기 | 응답된 전화의 평균 대기 시간 |
| `metrics.asaUnit` | {n}초 | |
| `metrics.abandoned` | 포기 | 끊고 나간 전화 수 |
| `metrics.abandonedUnit` | {n}건 | |
| `metrics.satisfaction` | 만족도 | 0~100 |
| `metrics.target` | 목표 | 예: 목표 80% |
| `metrics.targetFull` | {sec}초 안에 {pct}% | 고객사 패널에서 목표를 풀어 쓸 때 |
| `metrics.offered` | 들어온 전화 | 고객사 패널에서 |
| `metrics.handled` | 받은 전화 | 고객사 패널에서 |
| `metrics.agents` | 응대 인원 | 평균 몇 명이 전화를 받았는지 |
| `metrics.none` | — | 오늘 아직 전화가 없을 때 |
| `metrics.noneTip` | 오늘은 아직 전화가 없어요. | `—` 툴팁 |
| `metrics.belowTarget` | 목표 아래 | 서비스 레벨이 목표보다 낮을 때 빨간 표시 옆 툴팁 |
| `metrics.today` | 오늘 | 지표가 오늘 기준임을 알리는 작은 글씨 |

---

## 3. 아래 탭 7개 (`tabs`)

| 키 | 탭 이름 | 툴팁 |
|---|---|---|
| `tabs.people` | 사람 | 직원 한 명 한 명의 상태를 봐요 |
| `tabs.roster` | 근무표 | 요일마다 누가 어느 조로 일할지 정해요 |
| `tabs.tasks` | 업무 배치 | 누가 어떤 일을 맡을지 정해요 |
| `tabs.research` | 연구 | 센터를 더 좋게 만들 연구를 골라요 |
| `tabs.hiring` | 채용 | 새 상담사를 뽑아요 |
| `tabs.clients` | 고객사 | 고객사별 오늘 성적과 계약 상태 |
| `tabs.calendar` | 달력 | 앞으로 30일의 두 나라 휴일 |

### 3.1 공통 (`common`)

| 키 | 문구 | 메모 |
|---|---|---|
| `common.close` | 닫기 | |
| `common.back` | 뒤로 | 사람 상세에서 목록으로 |
| `common.honorific` | {name} 씨 | 화면에서 사람을 부를 때 |
| `common.days` | {n}일 | |
| `common.workdays` | {n}근무일 | |
| `common.hours` | {n}시간 | |
| `common.people` | {n}명 | |
| `common.money` | 💰 {cost} | |
| `common.yes` | 네 | 확인 창 |
| `common.no` | 아니요 | 확인 창 |

---

## 4. 사람 패널 (`people`)

### 4.1 목록

| 키 | 문구 | 메모 |
|---|---|---|
| `people.title` | 사람 | 패널 제목 |
| `people.count` | 모두 {n}명 | 제목 옆 |
| `people.empty` | 아직 함께하는 사람이 없어요. | 빈 상태 (실제로는 거의 없음) |
| `people.open` | 자세히 | 카드를 누르면 상세가 열림. 버튼이 필요할 때만 |
| `people.leftNote` | 이 사람은 센터를 떠났어요. | 상세를 보던 중 퇴사한 경우 |

### 4.2 역할 (`role`)

| 키 | 문구 |
|---|---|
| `role.agent` | 상담사 |
| `role.lead` | 팀장 |
| `role.qa` | QA |
| `role.probation` | 수습 {n}일 남음 |

### 4.3 지금 하는 일 (`activity`) — 카드 위 작은 글씨

| 키 | 문구 |
|---|---|
| `activity.phone` | 전화 중 |
| `activity.task` | 업무 중 |
| `activity.break` | 쉬는 중 |
| `activity.idle` | 대기 |
| `activity.off` | 퇴근 |

> 참고: `idle`은 근무 중인데 맡은 일이 없는 경우다(예: 맡은 고객사 영업이 끝났거나 계약이 끝남). 업무 배치를 다시 보라는 신호.

### 4.4 상세 카드 (`card`)

| 키 | 문구 | 메모 |
|---|---|---|
| `card.traits` | 특성 | 특성 이름·설명은 세계관 문안 4장 |
| `card.skills` | 기술 | |
| `card.condition` | 컨디션 | 막대 3개 묶음 제목 |
| `card.health` | 건강 | |
| `card.nation` | 출신 | 예: 출신 벨토라 |
| `card.holidays` | 다가오는 휴일 | 앞으로 14일 |
| `card.holidayItem` | {holiday} · {n}일 뒤 · {days}일 | 예: 거둠 연휴 · 5일 뒤 · 3일 |
| `card.holidayToday` | {holiday} · 오늘부터 · {days}일 | |
| `card.noHolidays` | 2주 안에 쉬는 날이 없어요. | |
| `card.shiftToday` | 오늘 근무 | 아래 근무조·건강 이름이 들어감 |
| `card.task` | 맡은 일 | 아래 업무 이름이 들어감 |

### 4.5 기술 4개 (`skill`)

| 키 | 이름 | 툴팁 |
|---|---|---|
| `skill.handling` | 응대 | 통화를 매끄럽게 끝내는 힘. 높을수록 빨리 처리해요. |
| `skill.systems` | 시스템 | 상담 화면을 다루는 솜씨. 높을수록 처리 시간이 줄어요. |
| `skill.coaching` | 코칭 | 다른 사람을 가르치는 힘. 팀장에게 중요해요. |
| `skill.evaluation` | 평가 | 통화를 듣고 고칠 점을 찾는 힘. QA에게 중요해요. |

> 참고: 기술 값은 0~10. 화면에 "응대 5.4"처럼 소수 한 자리로 보인다.

### 4.6 컨디션 막대 (`bar`)

| 키 | 이름 | 툴팁 |
|---|---|---|
| `bar.fatigue` | 피로 | 오래 일하면 쌓이고, 쉬면 풀려요. |
| `bar.stress` | 스트레스 | 힘든 통화로 쌓여요. 오래 높으면 번아웃이 와요. |
| `bar.morale` | 사기 | 피로와 스트레스가 낮을수록, 배려받을수록 올라요. |
| `bar.high` | 높음 | 피로·스트레스가 위험 구간일 때 막대 옆 |
| `bar.low` | 낮음 | 사기가 위험 구간일 때 막대 옆 |

### 4.7 건강 상태 (`health`)

| 키 | 이름 | 남은 날 표시 |
|---|---|---|
| `health.well` | 건강함 | — |
| `health.sick` | 아픔 | 아픔 · {days}일 남음 |
| `health.burnout` | 번아웃 | 번아웃 휴가 · {days}일 남음 |
| `health.leave` | 휴가 | 휴가 · {days}일 남음 |
| `health.absent` | 결근 | 오늘 안 나왔어요 |

---

## 5. 근무표 패널 (`roster`)

| 키 | 문구 | 메모 |
|---|---|---|
| `roster.title` | 근무표 | |
| `roster.help` | 칸을 누를 때마다 이른 조 → 늦은 조 → 휴무 순서로 바뀌어요. | 표 위 안내 한 줄 |
| `roster.colName` | 이름 | 첫 열 |
| `roster.colDays` | 월 · 화 · 수 · 목 · 금 | 요일 열 머리 |
| `roster.count` | 이른 조 {n}명 · 늦은 조 {n}명 | 요일 열 아래 합계 |
| `roster.hours` | 이른 조 09:00~18:00 · 늦은 조 12:00~21:00 | 표 아래 작은 글씨 |
| `roster.empty` | 근무표에 올릴 사람이 없어요. | |
| `roster.todayMark` | 오늘 | 오늘 요일 열 머리에 |

### 5.1 근무조 이름 (`shift`)

| 키 | 칸 안 (짧게) | 전체 이름 |
|---|---|---|
| `shift.early` | 이른 | 이른 조 |
| `shift.late` | 늦은 | 늦은 조 |
| `shift.off` | 휴무 | 휴무 |

---

## 6. 업무 배치 패널 (`tasks`)

| 키 | 문구 | 메모 |
|---|---|---|
| `tasks.title` | 업무 배치 | |
| `tasks.help` | 사람마다 맡을 일을 골라요. 전화 응대는 어느 고객사 전화를 받을지도 골라요. | 표 위 안내 |
| `tasks.colName` | 이름 | |
| `tasks.colRole` | 역할 | |
| `tasks.colTask` | 맡은 일 | |
| `tasks.colClient` | 고객사 | 전화 응대일 때만 |
| `tasks.pickClient` | 고객사 고르기 | 고객사 선택 칸 빈 값 |
| `tasks.seats` | 상담사 좌석 {n} / 8 | 좌석 표시 |
| `tasks.byClient` | {client} 응대 {n}명 | 표 아래 고객사별 합계 |
| `tasks.empty` | 일을 맡길 사람이 없어요. | |
| `tasks.clientEnded` | 계약 끝난 고객사예요. 다른 일을 맡겨 주세요. | 맡은 고객사가 떠났을 때 그 줄에 |

### 6.1 업무 이름 (`task`)

| 키 | 이름 | 툴팁 |
|---|---|---|
| `task.phone` | 전화 응대 | 고객사 전화를 받아요. |
| `task.coaching` | 코칭 | 상담사의 기술과 사기를 올리고 스트레스를 낮춰요. |
| `task.qa` | QA | 통화를 점검해 실수를 줄이고 만족도를 올려요. |
| `task.research` | 연구 | 진행 중인 연구를 앞당겨요. 그만큼 코칭·QA가 줄어요. |
| `task.training` | 교육 | 신입의 기술을 빠르게 올려요. |

---

## 7. 연구 패널 (`research`)

연구 이름·설명은 세계관 문안 6장.

| 키 | 문구 | 메모 |
|---|---|---|
| `research.title` | 연구 | |
| `research.help` | 연구는 사람이 시간을 들여야 진행돼요. 업무 배치에서 누군가에게 '연구'를 맡겨 주세요. | 패널 위 안내 |
| `research.cost` | 필요한 연구량 {n} | 돈이 아니라 사람의 시간으로 채우는 양 |
| `research.progress` | 진행 {n} / {cost} | 진행 막대 옆 |
| `research.start` | 연구 시작 | 버튼 |
| `research.current` | 진행 중 | 상태 표시 |
| `research.building` | 공사 중 · {hours}시간 남음 | 연구가 끝나고 공사 중일 때 |
| `research.done` | 완료 | 공사까지 끝난 연구 |
| `research.waiting` | 대기 | 아직 시작 안 한 연구 |
| `research.assigned` | 연구 맡은 사람 {n}명 | |
| `research.nobody` | 연구를 맡은 사람이 없어서 진행이 멈춰 있어요. | 진행 중인데 0명일 때 경고 |
| `research.oneAtATime` | 연구는 한 번에 하나씩만 할 수 있어요. | 다른 연구가 진행·공사 중일 때 시작 버튼 툴팁 |
| `research.allDone` | 지금 할 수 있는 연구를 모두 마쳤어요. | 빈 상태 |

> 참고: 지금 코드에서 연구는 돈이 들지 않는다(`cost`는 연구 점수). 그래서 "비용" 대신 "필요한 연구량"이라고 썼다. 돈이 들게 바꾸려면 알려 주세요.

---

## 8. 채용 패널 (`hiring`)

| 키 | 문구 | 메모 |
|---|---|---|
| `hiring.title` | 채용 | |
| `hiring.help` | 채용을 시작하면 며칠 뒤 지원자 두 명이 와요. 둘 중 한 명을 고를 수 있어요. | 패널 위 안내 |
| `hiring.cost` | 채용 비용 💰 {cost} | 시작할 때 바로 나감 |
| `hiring.seats` | 빈 좌석 {n}개 | |
| `hiring.noSeats` | 빈 좌석이 없어요 | 0개일 때 |
| `hiring.start` | 채용 시작 | 버튼 |
| `hiring.state.ready` | 채용할 수 있어요 | 상태: 가능 |
| `hiring.state.searching` | 지원자를 찾는 중 · {n}근무일째 | 상태: 진행 중 |
| `hiring.state.arrived` | 지원자가 왔어요. 알림에서 골라 주세요. | 상태: 후보 도착 |
| `hiring.probationNote` | 새 사람은 처음 두 주 동안 수습이에요. 교육을 맡기면 빨리 늘어요. | 작은 글씨 |
| `hiring.noRefund` | 보류하면 채용 비용은 돌려받지 못해요. | 작은 글씨 |

---

## 9. 고객사 패널 (`clients`)

| 키 | 문구 | 메모 |
|---|---|---|
| `clients.title` | 고객사 | |
| `clients.colName` | 고객사 | |
| `clients.colNation` | 나라 | |
| `clients.colTarget` | 목표 | |
| `clients.colSL` | 서비스 레벨 | |
| `clients.colAsa` | 평균 대기 | |
| `clients.colAbandoned` | 포기 | |
| `clients.colSatisfaction` | 만족도 | |
| `clients.colAgents` | 응대 인원 | |
| `clients.active` | 계약 중 | |
| `clients.ended` | 계약 종료 | |
| `clients.churnWarning` | 해지 경고 · {days}근무일 남음 | 해지 경고가 걸린 고객사 줄에 빨갛게 |
| `clients.fee` | 월 계약금 💰 {cost} | |
| `clients.metDays` | 이번 달 목표 지킨 날 {n} / {m} | (있으면) |
| `clients.empty` | 계약 중인 고객사가 없어요. | |

---

## 10. 달력 패널 (`calendar`)

| 키 | 문구 | 메모 |
|---|---|---|
| `calendar.title` | 달력 | |
| `calendar.help` | 앞으로 30일 동안의 두 나라 휴일이에요. 그 나라 출신 직원은 휴가를 신청할 수 있어요. | |
| `calendar.colDate` | 날짜 | |
| `calendar.colNation` | 나라 | |
| `calendar.colHoliday` | 휴일 | |
| `calendar.colPeople` | 그 나라 직원 | 이름을 쉼표로 |
| `calendar.length` | {days}일간 | 연휴 길이 |
| `calendar.today` | 오늘 | |
| `calendar.callsDown` | 전화 줄어요 | 휴일 동안 콜 배수가 1 아래일 때 작은 표시 |
| `calendar.callsUp` | 끝나면 몰려요 | 휴일 뒤 콜 배수가 1 위일 때 작은 표시 |
| `calendar.weeklyRest` | 주간 휴일: {nation} {days} | 예: 주간 휴일: 카무엔 금·토 |
| `calendar.noPeople` | 없음 | 그 나라 출신이 없을 때 |
| `calendar.empty` | 앞으로 30일 동안 휴일이 없어요. | |

---

## 11. 거절 문구 (`refuse`)

버튼을 눌렀는데 할 수 없을 때 패널 안에 보이는 문장. 키는 코드의 거절 이유와 같다.

| 키 | 언제 | 문구 |
|---|---|---|
| `refuse.no-seat` | 채용: 상담사 좌석 8개가 다 참 | 빈 좌석이 없어요. 지금은 더 뽑을 수 없어요. |
| `refuse.no-cash` | 채용: 돈이 채용 비용보다 적음 | 돈이 모자라요. 채용 비용은 💰 {cost}예요. |
| `refuse.already` | 채용: 이미 진행 중 | 이미 채용을 진행하고 있어요. |
| `refuse.busy` | 연구: 다른 연구가 진행·공사 중이거나 이미 끝남 | 지금은 이 연구를 시작할 수 없어요. 연구는 한 번에 하나씩이에요. |
| `refuse.unknown-person` | 없는 사람(이미 떠남) | 이 사람은 이제 센터에 없어요. |
| `refuse.unknown-client` | 계약이 끝난 고객사 | 계약이 끝난 고객사예요. 다른 고객사를 골라 주세요. |
| `refuse.unknown-research` | 없는 연구 | 찾을 수 없는 연구예요. |
| `refuse.unknown-event` | 없는 알림 | 이미 사라진 알림이에요. |
| `refuse.unknown-action` | 알 수 없는 버튼 | 지금은 할 수 없는 일이에요. |
| `refuse.bad-weekday` | 잘못된 요일 | 근무표는 월~금만 정할 수 있어요. |
| `refuse.bad-shift` | 잘못된 근무조 | 이른 조, 늦은 조, 휴무 중에서 골라 주세요. |
| `refuse.bad-task` | 잘못된 업무 | 맡길 수 없는 일이에요. |
| `refuse.bad-choice` | 이미 답했거나 없는 선택지 | 이미 답한 알림이에요. |
| `refuse.game-over` | 게임이 끝난 뒤 | 센터가 문을 닫았어요. 새 게임을 시작해 주세요. |
| `refuse.default` | 위에 없는 이유 | 지금은 할 수 없어요. |

---

## 12. 알림 (`inbox`)

| 키 | 문구 | 메모 |
|---|---|---|
| `inbox.title` | 알림 | |
| `inbox.unread` | 새 알림 {n} | 제목 옆 숫자 |
| `inbox.needsAnswer` | 답이 필요해요 | 선택지 있는 알림 앞 표시 |
| `inbox.deadline` | {days}일 안에 답해 주세요 | 마감 있는 알림 |
| `inbox.deadlineToday` | 오늘까지 답해 주세요 | |
| `inbox.choices` | 어떻게 할까요? | 선택지 버튼 위 |
| `inbox.result` | 결과 | 고른 뒤 결과 문장 앞 |
| `inbox.yourChoice` | 고른 답: {choice} | 이미 답한 알림을 다시 펼쳤을 때 |
| `inbox.auto` | 답이 없어 '{choice}'(으)로 처리했어요. | 마감이 지나 자동 처리된 알림 끝에 덧붙임 |
| `inbox.day` | {date} | 알림 받은 날 |
| `inbox.empty` | 새 소식이 없어요. 조용한 하루예요. | 빈 상태 |
| `inbox.showOld` | 지난 알림 보기 | 읽은 알림 펼치기 |

> 참고: `{choice}`에는 세계관 문안 7.2의 선택지 문구가 그대로 들어간다. 예: "답이 없어 '보내 준다'(으)로 처리했어요." 코드에서 받침을 보고 "(으)로"를 "으로/로"로 바꿀 수 있다(Task 3의 자리표시 채우기에서 처리 제안).

### 12.1 김미소 말풍선 (`advisor`)

| 키 | 문구 | 메모 |
|---|---|---|
| `advisor.name` | 김미소 | 말풍선 위 이름 |
| `advisor.role` | 선배 운영 매니저 | 이름 옆 작은 글씨 |
| `advisor.hide` | 접기 | |

---

## 13. 시작 화면 (`start`)

| 키 | 문구 | 메모 |
|---|---|---|
| `start.title` | On Behalf Inc | 게임 제목 (영문 그대로) |
| `start.subtitle` | 고객센터를 맡아 운영해 보세요 | 제목 아래 한 줄 |
| `start.intro` | 행성 엘로반의 작은 고객센터, On Behalf Inc. 센터장인 당신은 벨토라와 카무엔에서 온 열 명과 함께 두 고객사의 전화를 받아요. 근무표를 짜고, 일을 나누고, 지친 사람을 쉬게 하면서 서비스 레벨을 지켜 주세요. 돈이 바닥나거나 고객사가 모두 떠나면 문을 닫아요. | 소개 한 문단 |
| `start.continue` | 이어하기 | 저장이 있을 때만 |
| `start.continueInfo` | {year}년차 {month}월 {day}일부터 | 이어하기 버튼 아래 작은 글씨 |
| `start.newGame` | 새 게임 | |
| `start.overwriteTitle` | 새로 시작할까요? | 저장이 있는데 새 게임을 누르면 |
| `start.overwriteText` | 지금 저장된 센터는 지워지고 다시 돌아올 수 없어요. | |
| `start.overwriteYes` | 새로 시작 | |
| `start.overwriteNo` | 취소 | |
| `start.brokenSave` | 저장을 읽지 못해서 새 게임으로 시작해요. | 저장이 깨졌을 때 |
| `start.autosave` | 하루가 끝날 때마다 자동으로 저장돼요. | 작은 글씨 |
| `start.keys` | 스페이스: 멈춤·다시 시작 · 1·2·3: 속도 | 작은 글씨 |

---

## 14. 김미소 첫 안내 (`intro`)

새 게임을 처음 시작할 때 한 줄씩 넘겨 보는 말풍선. 마지막 줄 뒤 버튼으로 닫는다.

| 키 | 문구 |
|---|---|
| `intro.1` | 반가워요, 센터장님. 저는 김미소예요. 이 센터에서 오래 일했어요. |
| `intro.2` | 우리 일은 전화를 제때 받는 거예요. 아래 줄의 서비스 레벨이 목표 위에 있으면 잘하고 있는 거예요. |
| `intro.3` | 사람은 기계가 아니에요. 피로와 스트레스가 쌓이면 아프고, 오래 쌓이면 떠나요. 근무표와 쉬는 시간을 꼭 챙겨 주세요. |
| `intro.4` | 벨토라와 카무엔은 쉬는 날이 달라요. 달력 탭을 자주 봐 두면 덜 당황해요. |
| `intro.5` | 무슨 일이 생기면 오른쪽 알림에 뜨고, 제가 한마디 거들게요. 그럼 시작해 볼까요? |
| `intro.next` | 다음 |
| `intro.done` | 시작하기 |
| `intro.skip` | 건너뛰기 |

---

## 15. 게임 오버 화면 (`gameOver`)

본문은 세계관 문안의 `game-over-cash` / `game-over-clients` 사건 문장과 김미소 한마디를 그대로 쓰고, 이 화면에는 제목·요약·버튼만 더한다.

| 키 | 문구 | 메모 |
|---|---|---|
| `gameOver.title` | 센터 문을 닫았어요 | 공통 제목 |
| `gameOver.reason.game-over-cash` | 돈이 바닥나 급여를 줄 수 없었어요. | 이유 한 줄 |
| `gameOver.reason.game-over-clients` | 남은 고객사가 하나도 없어요. | 이유 한 줄 |
| `gameOver.days` | 버틴 날: {days}일 | |
| `gameOver.lastDate` | 마지막 날: {year}년차 {month}월 {day}일 | |
| `gameOver.milestones` | 이룬 이정표 {n}개 | 0개면 숨김 |
| `gameOver.newGame` | 새 게임 | 버튼 |
| `gameOver.thanks` | 함께해서 고마웠어요. | 버튼 위 작은 글씨 |

---

## 16. 이정표 축하 (`milestone`)

사건 문장(세계관 문안 7.1)에 더해 화면 가운데 잠깐 뜨는 짧은 축하 띠.

| 키 | 문구 | 메모 |
|---|---|---|
| `milestone.banner` | 이정표 달성! | 띠 제목 |
| `milestone.milestone-big-client` | 고객사 세 곳과 함께해요 | |
| `milestone.milestone-rank-s` | 평판 S등급에 올랐어요 | |
| `milestone.ok` | 좋아요 | 띠 닫기 버튼 |

---

## 17. 문구 점검표

- [x] "진상"이라는 말을 쓰지 않음
- [x] 다른 게임 이름 없음
- [x] 세계관 이름(엘로반·벨토라·카무엔·고객사·연구·사건·선택지)은 승인 문안 그대로
- [x] 거절 이유 15개 모두 문구 있음 (`no-seat`, `no-cash`, `already`, `busy`, `unknown-person`, `unknown-client`, `unknown-research`, `unknown-event`, `unknown-action`, `bad-weekday`, `bad-shift`, `bad-task`, `bad-choice`, `game-over`, 기본값)
- [x] 업무 5개, 근무조 3개, 건강 상태 5개, 기술 4개, 막대 3개, 평판 등급 5개, 탭 7개
- [x] 버튼 이름은 대부분 6자 이내 (`업무 배치`, `채용 시작`, `연구 시작`, `이어하기`, `새 게임`, `새로 시작`, `시작하기`)

## 18. 결정이 필요한 것

1. **연구 "비용":** 지금 코드는 연구에 돈을 쓰지 않고 사람의 시간(연구 점수)만 쓴다. 그래서 "필요한 연구량"으로 적었다. 돈도 들게 할지?
2. **기술 이름:** `handling`·`systems`·`coaching`·`evaluation`을 "응대·시스템·코칭·평가"로 옮겼다. 현장에서 더 익숙한 말이 있으면 바꿔 주세요.
3. **자동 처리 문구의 "(으)로":** 코드가 받침을 보고 "으로/로"를 고르게 할지, 그냥 "(으)로"로 둘지.
4. **`idle` "할 일 없음":** 근무 중인데 맡은 일이 없는 상태를 이렇게 불러도 될지(예: "대기"가 더 익숙한지).
