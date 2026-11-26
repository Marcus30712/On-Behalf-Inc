// Fees are placeholder values (copy: 가상 값). callsPerDay, ahtMin and patienceSec
// are not in the approved copy; callsPerDay was set by the balance task so that
// two early and two late agents per client meet the target in most intervals
// (docs/superpowers/plans/2026-11-24-sim-core-balance.md).
// v1.6: every callsPerDay is x0.8 of its earlier value (rounded; user decision
// 2026-11-26). The lead's break plan puts breaks in the hours one shift covers
// alone, so the same two agents per client and shift need fewer calls to meet
// the target (balance record, v1.6 section). The notes below give the values
// from before v1.6.
const WEEKDAY_HOURS = { days: [0, 1, 2, 3, 4], open: 540, close: 1260 };

export const CLIENTS = [
  {
    id: 'gureum-travel', name: '구름다리 여행', industry: '온라인 여행 예약', nation: 'veltora', start: true,
    slTarget: { pct: 80, sec: 20 }, monthlyFee: 18000,
    callsPerDay: 80, ahtMin: 5, patienceSec: 90, hours: { ...WEEKDAY_HOURS },
  },
  {
    id: 'mulbit-telecom', name: '물빛 통신', industry: '인터넷·휴대폰 통신', nation: 'kamuen', start: true,
    slTarget: { pct: 80, sec: 30 }, monthlyFee: 16000,
    callsPerDay: 64, ahtMin: 6, patienceSec: 75, hours: { ...WEEKDAY_HOURS },
  },
  {
    id: 'dalbit-mall', name: '달빛몰', industry: '온라인 쇼핑', nation: 'kamuen', start: false,
    slTarget: { pct: 90, sec: 15 }, monthlyFee: 24000,
    callsPerDay: 64, ahtMin: 4, patienceSec: 60, hours: { ...WEEKDAY_HOURS },
  },
  // v1.2: offered after expansion 1 (requiresOfficeLevel 1). callsPerDay set by the v1.2
  // balance task (balance record, v1.2 section): they arrive once calls have grown
  // (x1.14, up to x1.21 after expansion 1), so 70 grows to about 85; four agents
  // mostly meet the weekday client and a crew of three the weekend one, whose
  // 09:00-18:00 window sees about 80% of the daily CURVE.
  {
    id: 'bandi-repair', name: '반딧불 가전', industry: '가전 수리 접수', nation: 'kamuen', start: false,
    slTarget: { pct: 80, sec: 30 }, monthlyFee: 17000, requiresOfficeLevel: 1,
    callsPerDay: 56, ahtMin: 5, patienceSec: 90, hours: { ...WEEKDAY_HOURS },
  },
  {
    id: 'baram-delivery', name: '바람개비 배달', industry: '음식 배달 주문', nation: 'veltora', start: false,
    slTarget: { pct: 80, sec: 20 }, monthlyFee: 9000, requiresOfficeLevel: 1,
    callsPerDay: 48, ahtMin: 4, patienceSec: 60, hours: { days: [5, 6], open: 540, close: 1080 },
  },
  // v1.3: channel clients, offered only after their research (requiresResearch) and once
  // the office has the seats (requiresOfficeLevel; design §4.1, revised by the balance
  // task: an offer that came earlier was declined and then queued behind re-offers). Chat:
  // slTarget sec like phone; email: slTarget.openMinutes is the reply deadline counted in
  // the client's open minutes. Volumes set by the v1.3 balance task (balance record, v1.3
  // section): four chat agents (two a shift, 1.5 seats each) mostly meet 80 chats a day at
  // 9 minutes, where one a shift cannot; the email client needs about two agents (84 mails
  // at 6 minutes), so its fee per agent (6,000) is in line with the other clients. 84, not
  // the first 100 (final review I5): two agents assigned once, with nobody standing in on
  // their days off, keep the client on 10/10 seeds 1-10 (100: 2/10; 85: 7/10).
  {
    id: 'saebyeol-bank', name: '새벽별 은행', industry: '인터넷 은행 상담', nation: 'veltora', start: false,
    channel: 'chat', requiresResearch: 'chat-desk', requiresOfficeLevel: 1,
    slTarget: { pct: 80, sec: 60 }, monthlyFee: 20000,
    callsPerDay: 64, ahtMin: 9, patienceSec: 240, hours: { ...WEEKDAY_HOURS },
  },
  {
    id: 'solbang-books', name: '솔방울 서점', industry: '온라인 서점 주문·반품', nation: 'kamuen', start: false,
    channel: 'email', requiresResearch: 'mail-desk', requiresOfficeLevel: 2,
    slTarget: { pct: 90, openMinutes: 720 }, monthlyFee: 12000,
    callsPerDay: 67, ahtMin: 6, hours: { ...WEEKDAY_HOURS },
  },
];
