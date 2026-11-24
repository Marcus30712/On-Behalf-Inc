// Screen copy: approved 2026-11-24 (docs/superpowers/specs/2026-11-24-on-behalf-inc-ui-copy.md).
// Strings are copied from that document under its English keys; change the copy there first.
// Placeholders ({name}, {days}, ...) are filled by fill(); a sentence whose placeholder
// has no value is dropped whole.
import { EVENTS } from '../world/events.js';
import { ADVISOR } from '../world/advisor.js';
import { RESEARCH } from '../world/research.js';
import { NATIONS } from '../world/nations.js';
import { CLIENTS } from '../world/clients.js';

export const UI_TEXT = {
  "topbar": {
    "date": "{year}년차 {month}월 {day}일 ({weekday})",
    "time": "{hh}:{mm}",
    "closed": "영업 끝",
    "weekend": "주말 휴무",
    "cash": "돈",
    "cashTip": "센터 통장 잔액. 월말에 계약금이 들어오고 급여가 나가요. 0 아래로 내려가면 문을 닫아요.",
    "cashLow": "돈이 얼마 안 남았어요",
    "reputation": "평판",
    "reputationTip": "서비스 레벨 목표를 얼마나 지켰는지와 고객사 만족도로 정해져요."
  },
  "speed": {
    "0": {
      "label": "⏸",
      "tip": "일시정지 (스페이스)"
    },
    "1": {
      "label": "▶",
      "tip": "보통 속도 (1)"
    },
    "2": {
      "label": "▶▶",
      "tip": "2배 빠르게 (2)"
    },
    "3": {
      "label": "▶▶▶",
      "tip": "3배 빠르게 (3)"
    },
    "resume": {
      "tip": "다시 시작 (스페이스)"
    },
    "autoPaused": "답을 기다려요"
  },
  "grade": {
    "S": {
      "grade": "S",
      "text": "최고예요. 새 고객사들이 먼저 찾아와요."
    },
    "A": {
      "grade": "A",
      "text": "아주 좋아요. 제안이 들어오기 시작해요."
    },
    "B": {
      "grade": "B",
      "text": "괜찮아요. 고객사들이 믿고 맡겨요."
    },
    "C": {
      "grade": "C",
      "text": "불안해요. 목표를 놓치는 날이 잦아요."
    },
    "D": {
      "grade": "D",
      "text": "위험해요. 고객사가 떠날 수 있어요."
    }
  },
  "metrics": {
    "serviceLevel": "서비스 레벨",
    "serviceLevelShort": "SL",
    "asa": "평균 대기",
    "asaUnit": "{n}초",
    "abandoned": "포기",
    "abandonedUnit": "{n}건",
    "satisfaction": "만족도",
    "target": "목표",
    "targetFull": "{sec}초 안에 {pct}%",
    "offered": "들어온 전화",
    "handled": "받은 전화",
    "agents": "응대 인원",
    "none": "—",
    "noneTip": "오늘은 아직 전화가 없어요.",
    "belowTarget": "목표 아래",
    "today": "오늘"
  },
  "tabs": {
    "people": {
      "name": "사람",
      "tip": "직원 한 명 한 명의 상태를 봐요"
    },
    "roster": {
      "name": "근무표",
      "tip": "요일마다 누가 어느 조로 일할지 정해요"
    },
    "tasks": {
      "name": "업무 배치",
      "tip": "누가 어떤 일을 맡을지 정해요"
    },
    "research": {
      "name": "연구",
      "tip": "센터를 더 좋게 만들 연구를 골라요"
    },
    "hiring": {
      "name": "채용",
      "tip": "새 상담사를 뽑아요"
    },
    "clients": {
      "name": "고객사",
      "tip": "고객사별 오늘 성적과 계약 상태"
    },
    "calendar": {
      "name": "달력",
      "tip": "앞으로 30일의 두 나라 휴일"
    }
  },
  "common": {
    "close": "닫기",
    "back": "뒤로",
    "honorific": "{name} 씨",
    "days": "{n}일",
    "workdays": "{n}근무일",
    "hours": "{n}시간",
    "people": "{n}명",
    "money": "💰 {cost}",
    "yes": "네",
    "no": "아니요"
  },
  "people": {
    "title": "사람",
    "count": "모두 {n}명",
    "empty": "아직 함께하는 사람이 없어요.",
    "open": "자세히",
    "leftNote": "이 사람은 센터를 떠났어요."
  },
  "role": {
    "agent": "상담사",
    "lead": "팀장",
    "qa": "QA",
    "probation": "수습 {n}일 남음"
  },
  "activity": {
    "phone": "전화 중",
    "task": "업무 중",
    "break": "쉬는 중",
    "idle": "대기",
    "off": "퇴근"
  },
  "card": {
    "traits": "특성",
    "skills": "기술",
    "condition": "컨디션",
    "health": "건강",
    "nation": "출신",
    "holidays": "다가오는 휴일",
    "holidayItem": "{holiday} · {n}일 뒤 · {days}일",
    "holidayToday": "{holiday} · 오늘부터 · {days}일",
    "noHolidays": "2주 안에 쉬는 날이 없어요.",
    "shiftToday": "오늘 근무",
    "task": "맡은 일"
  },
  "skill": {
    "handling": {
      "name": "응대",
      "tip": "통화를 매끄럽게 끝내는 힘. 높을수록 빨리 처리해요."
    },
    "systems": {
      "name": "시스템",
      "tip": "상담 화면을 다루는 솜씨. 높을수록 처리 시간이 줄어요."
    },
    "coaching": {
      "name": "코칭",
      "tip": "다른 사람을 가르치는 힘. 팀장에게 중요해요."
    },
    "evaluation": {
      "name": "평가",
      "tip": "통화를 듣고 고칠 점을 찾는 힘. QA에게 중요해요."
    }
  },
  "bar": {
    "fatigue": {
      "name": "피로",
      "tip": "오래 일하면 쌓이고, 쉬면 풀려요."
    },
    "stress": {
      "name": "스트레스",
      "tip": "힘든 통화로 쌓여요. 오래 높으면 번아웃이 와요."
    },
    "morale": {
      "name": "사기",
      "tip": "피로와 스트레스가 낮을수록, 배려받을수록 올라요."
    },
    "high": {
      "name": "높음",
      "tip": "피로·스트레스가 위험 구간일 때 막대 옆"
    },
    "low": {
      "name": "낮음",
      "tip": "사기가 위험 구간일 때 막대 옆"
    }
  },
  "health": {
    "well": {
      "name": "건강함",
      "left": "—"
    },
    "sick": {
      "name": "아픔",
      "left": "아픔 · {days}일 남음"
    },
    "burnout": {
      "name": "번아웃",
      "left": "번아웃 휴가 · {days}일 남음"
    },
    "leave": {
      "name": "휴가",
      "left": "휴가 · {days}일 남음"
    },
    "absent": {
      "name": "결근",
      "left": "오늘 안 나왔어요"
    }
  },
  "roster": {
    "title": "근무표",
    "help": "칸을 누를 때마다 이른 조 → 늦은 조 → 휴무 순서로 바뀌어요.",
    "colName": "이름",
    "colDays": "월 · 화 · 수 · 목 · 금",
    "count": "이른 조 {n}명 · 늦은 조 {n}명",
    "hours": "이른 조 09:00~18:00 · 늦은 조 12:00~21:00",
    "empty": "근무표에 올릴 사람이 없어요.",
    "todayMark": "오늘"
  },
  "shift": {
    "early": {
      "short": "이른",
      "full": "이른 조"
    },
    "late": {
      "short": "늦은",
      "full": "늦은 조"
    },
    "off": {
      "short": "휴무",
      "full": "휴무"
    }
  },
  "tasks": {
    "title": "업무 배치",
    "help": "사람마다 맡을 일을 골라요. 전화 응대는 어느 고객사 전화를 받을지도 골라요.",
    "colName": "이름",
    "colRole": "역할",
    "colTask": "맡은 일",
    "colClient": "고객사",
    "pickClient": "고객사 고르기",
    "seats": "상담사 좌석 {n} / 8",
    "byClient": "{client} 응대 {n}명",
    "empty": "일을 맡길 사람이 없어요.",
    "clientEnded": "계약 끝난 고객사예요. 다른 일을 맡겨 주세요."
  },
  "task": {
    "phone": {
      "name": "전화 응대",
      "tip": "고객사 전화를 받아요."
    },
    "coaching": {
      "name": "코칭",
      "tip": "상담사의 기술과 사기를 올리고 스트레스를 낮춰요."
    },
    "qa": {
      "name": "QA",
      "tip": "통화를 점검해 실수를 줄이고 만족도를 올려요."
    },
    "research": {
      "name": "연구",
      "tip": "진행 중인 연구를 앞당겨요. 그만큼 코칭·QA가 줄어요."
    },
    "training": {
      "name": "교육",
      "tip": "신입의 기술을 빠르게 올려요."
    }
  },
  "research": {
    "title": "연구",
    "help": "연구는 사람이 시간을 들여야 진행돼요. 업무 배치에서 누군가에게 '연구'를 맡겨 주세요.",
    "cost": "필요한 연구량 {n}",
    "progress": "진행 {n} / {cost}",
    "start": "연구 시작",
    "current": "진행 중",
    "building": "공사 중 · {hours}시간 남음",
    "done": "완료",
    "waiting": "대기",
    "assigned": "연구 맡은 사람 {n}명",
    "nobody": "연구를 맡은 사람이 없어서 진행이 멈춰 있어요.",
    "oneAtATime": "연구는 한 번에 하나씩만 할 수 있어요.",
    "allDone": "지금 할 수 있는 연구를 모두 마쳤어요."
  },
  "hiring": {
    "title": "채용",
    "help": "채용을 시작하면 며칠 뒤 지원자 두 명이 와요. 둘 중 한 명을 고를 수 있어요.",
    "cost": "채용 비용 💰 {cost}",
    "seats": "빈 좌석 {n}개",
    "noSeats": "빈 좌석이 없어요",
    "start": "채용 시작",
    "state": {
      "ready": "채용할 수 있어요",
      "searching": "지원자를 찾는 중 · {n}근무일째",
      "arrived": "지원자가 왔어요. 알림에서 골라 주세요."
    },
    "probationNote": "새 사람은 처음 두 주 동안 수습이에요. 교육을 맡기면 빨리 늘어요.",
    "noRefund": "보류하면 채용 비용은 돌려받지 못해요."
  },
  "clients": {
    "title": "고객사",
    "colName": "고객사",
    "colNation": "나라",
    "colTarget": "목표",
    "colSL": "서비스 레벨",
    "colAsa": "평균 대기",
    "colAbandoned": "포기",
    "colSatisfaction": "만족도",
    "colAgents": "응대 인원",
    "active": "계약 중",
    "ended": "계약 종료",
    "churnWarning": "해지 경고 · {days}근무일 남음",
    "fee": "월 계약금 💰 {cost}",
    "metDays": "이번 달 목표 지킨 날 {n} / {m}",
    "empty": "계약 중인 고객사가 없어요."
  },
  "calendar": {
    "title": "달력",
    "help": "앞으로 30일 동안의 두 나라 휴일이에요. 그 나라 출신 직원은 휴가를 신청할 수 있어요.",
    "colDate": "날짜",
    "colNation": "나라",
    "colHoliday": "휴일",
    "colPeople": "그 나라 직원",
    "length": "{days}일간",
    "today": "오늘",
    "callsDown": "전화 줄어요",
    "callsUp": "끝나면 몰려요",
    "weeklyRest": "주간 휴일: {nation} {days}",
    "noPeople": "없음",
    "empty": "앞으로 30일 동안 휴일이 없어요."
  },
  "refuse": {
    "no-seat": "빈 좌석이 없어요. 지금은 더 뽑을 수 없어요.",
    "no-cash": "돈이 모자라요. 채용 비용은 💰 {cost}예요.",
    "already": "이미 채용을 진행하고 있어요.",
    "busy": "지금은 이 연구를 시작할 수 없어요. 연구는 한 번에 하나씩이에요.",
    "unknown-person": "이 사람은 이제 센터에 없어요.",
    "unknown-client": "계약이 끝난 고객사예요. 다른 고객사를 골라 주세요.",
    "unknown-research": "찾을 수 없는 연구예요.",
    "unknown-event": "이미 사라진 알림이에요.",
    "unknown-action": "지금은 할 수 없는 일이에요.",
    "bad-weekday": "근무표는 월~금만 정할 수 있어요.",
    "bad-shift": "이른 조, 늦은 조, 휴무 중에서 골라 주세요.",
    "bad-task": "맡길 수 없는 일이에요.",
    "bad-choice": "이미 답한 알림이에요.",
    "game-over": "센터가 문을 닫았어요. 새 게임을 시작해 주세요.",
    "default": "지금은 할 수 없어요."
  },
  "inbox": {
    "title": "알림",
    "unread": "새 알림 {n}",
    "needsAnswer": "답이 필요해요",
    "deadline": "{days}일 안에 답해 주세요",
    "deadlineToday": "오늘까지 답해 주세요",
    "choices": "어떻게 할까요?",
    "result": "결과",
    "yourChoice": "고른 답: {choice}",
    "auto": "답이 없어 '{choice}'(으)로 처리했어요.",
    "day": "{date}",
    "empty": "새 소식이 없어요. 조용한 하루예요.",
    "showOld": "지난 알림 보기"
  },
  "advisor": {
    "name": "김미소",
    "role": "선배 운영 매니저",
    "hide": "접기"
  },
  "start": {
    "title": "On Behalf Inc",
    "subtitle": "고객센터를 맡아 운영해 보세요",
    "intro": "행성 엘로반의 작은 고객센터, On Behalf Inc. 센터장인 당신은 벨토라와 카무엔에서 온 열 명과 함께 두 고객사의 전화를 받아요. 근무표를 짜고, 일을 나누고, 지친 사람을 쉬게 하면서 서비스 레벨을 지켜 주세요. 돈이 바닥나거나 고객사가 모두 떠나면 문을 닫아요.",
    "continue": "이어하기",
    "continueInfo": "{year}년차 {month}월 {day}일부터",
    "newGame": "새 게임",
    "overwriteTitle": "새로 시작할까요?",
    "overwriteText": "지금 저장된 센터는 지워지고 다시 돌아올 수 없어요.",
    "overwriteYes": "새로 시작",
    "overwriteNo": "취소",
    "brokenSave": "저장을 읽지 못해서 새 게임으로 시작해요.",
    "autosave": "하루가 끝날 때마다 자동으로 저장돼요.",
    "keys": "스페이스: 멈춤·다시 시작 · 1·2·3: 속도"
  },
  "intro": {
    "1": "반가워요, 센터장님. 저는 김미소예요. 이 센터에서 오래 일했어요.",
    "2": "우리 일은 전화를 제때 받는 거예요. 아래 줄의 서비스 레벨이 목표 위에 있으면 잘하고 있는 거예요.",
    "3": "사람은 기계가 아니에요. 피로와 스트레스가 쌓이면 아프고, 오래 쌓이면 떠나요. 근무표와 쉬는 시간을 꼭 챙겨 주세요.",
    "4": "벨토라와 카무엔은 쉬는 날이 달라요. 달력 탭을 자주 봐 두면 덜 당황해요.",
    "5": "무슨 일이 생기면 오른쪽 알림에 뜨고, 제가 한마디 거들게요. 그럼 시작해 볼까요?",
    "next": "다음",
    "done": "시작하기",
    "skip": "건너뛰기"
  },
  "gameOver": {
    "title": "센터 문을 닫았어요",
    "reason": {
      "game-over-cash": "돈이 바닥나 급여를 줄 수 없었어요.",
      "game-over-clients": "남은 고객사가 하나도 없어요."
    },
    "days": "버틴 날: {days}일",
    "lastDate": "마지막 날: {year}년차 {month}월 {day}일",
    "milestones": "이룬 이정표 {n}개",
    "newGame": "새 게임",
    "thanks": "함께해서 고마웠어요."
  },
  "milestone": {
    "banner": "이정표 달성!",
    "milestone-big-client": "고객사 세 곳과 함께해요",
    "milestone-rank-s": "평판 S등급에 올랐어요",
    "ok": "좋아요"
  }
};

// Korean particles: 받침 check on the last Hangul syllable.
const jongseong = (ch) => {
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 ? code % 28 : 0; // 0 = no 받침, 8 = ㄹ
};
const lastChar = (word) => word.replace(/[\s'"’”)\]]+$/u, '').slice(-1);
const eroFor = (word) => {
  const j = jongseong(lastChar(word));
  return j === 0 || j === 8 ? '로' : '으로';
};

// '책' -> '책으로', '서울' -> '서울로', '휴가' -> '휴가로'.
export const withParticle = (word) => word + eroFor(word);

// Fills {key} placeholders. Splits on '. ', '? ', '! ' and the end of the string;
// a sentence with any placeholder lacking a value is dropped. Then settles
// "(으)로" and "이(가)" by the 받침 of the text before them.
export function fill(template, values = {}) {
  const sentences = String(template).match(/[\s\S]+?(?:[.?!]+(?=\s|$)|$)\s*/g) ?? [];
  const kept = [];
  for (const sentence of sentences) {
    const keys = [...sentence.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    if (keys.some((k) => values[k] === undefined || values[k] === null || values[k] === '')) continue;
    kept.push(sentence.replace(/\{(\w+)\}/g, (_, k) => String(values[k])));
  }
  return kept.join('').trim()
    .replace(/([^\s])\(으\)로/gu, (_, ch, off, s) => ch + eroFor(s.slice(0, off + 1)))
    .replace(/(\S)이\(가\)/gu, (_, ch) => ch + (jongseong(ch) === 0 ? '가' : '이'));
}

const money = (n) => Math.round(n).toLocaleString('en-US');

// The values an event's templates can use, read from its data (see sim/*.js pushEvent calls).
function valuesFor(event) {
  const d = event.data ?? {};
  const research = RESEARCH.find((r) => r.id === d.researchId);
  const holiday = NATIONS.flatMap((n) => n.holidays).find((h) => h.id === d.holidayId);
  const nation = NATIONS.find((n) => n.id === d.nationId);
  const clientDef = CLIENTS.find((c) => c.id === event.clientId);
  const helped = d.helped ?? [];
  const values = {
    name: d.name,
    client: d.client,
    holiday: holiday?.name ?? d.holiday,
    nation: nation?.name ?? d.nation,
    days: d.days,
    research: research?.name,
    hours: research?.buildHours,
    cand1: d.cand1,
    cand2: d.cand2,
  };
  if (clientDef) {
    values.sl = fill(UI_TEXT.metrics.targetFull, { sec: clientDef.slTarget.sec, pct: clientDef.slTarget.pct });
    values.fee = fill(UI_TEXT.common.money, { cost: money(clientDef.monthlyFee) });
  }
  if (event.id === 'build-done') {
    values.name = helped.map((h) => h.name).join('·') || undefined;
    const left = [...new Set(helped.map((h) => h.daysLeft).filter((n) => n !== undefined))];
    values.days = left.length > 0 ? left.join('·') : undefined;
  }
  return values;
}

// Event -> { title, text, choices?, advisor }. Unknown or missing values drop their sentence.
export function eventText(event) {
  const def = EVENTS[event.id];
  if (!def) return { title: '', text: '', advisor: '' };
  const values = valuesFor(event);
  let text;
  if (event.id === 'build-done') {
    const helped = event.data?.helped ?? [];
    const research = RESEARCH.find((r) => r.id === event.data?.researchId);
    const done = helped.length > 0 && research ? fill(research.doneText, values) : '';
    text = done || fill(def.textNobody, values);
  } else {
    text = fill(def.text, values);
  }
  const out = { title: fill(def.title, values), text };
  if (def.choices) {
    out.choices = def.choices.map((c) => ({
      id: c.id, label: fill(c.label, values), result: fill(c.result, values),
    }));
    const chosen = event.auto && out.choices.find((c) => c.id === event.choice);
    if (chosen?.label) out.text = [out.text, fill(UI_TEXT.inbox.auto, { choice: chosen.label })].filter(Boolean).join(' ');
  }
  const lines = ADVISOR[event.id] ?? [];
  out.advisor = '';
  for (let i = 0; i < lines.length && !out.advisor; i++) {
    out.advisor = fill(lines[((event.day ?? 0) + i) % lines.length], values);
  }
  return out;
}
