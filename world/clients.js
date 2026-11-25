// Fees are placeholder values (copy: 가상 값). callsPerDay, ahtMin and patienceSec
// are not in the approved copy; callsPerDay was set by the balance task so that
// two early and two late agents per client meet the target in most intervals
// (docs/superpowers/plans/2026-11-24-sim-core-balance.md).
const WEEKDAY_HOURS = { days: [0, 1, 2, 3, 4], open: 540, close: 1260 };

export const CLIENTS = [
  {
    id: 'gureum-travel', name: '구름다리 여행', industry: '온라인 여행 예약', nation: 'veltora', start: true,
    slTarget: { pct: 80, sec: 20 }, monthlyFee: 18000,
    callsPerDay: 100, ahtMin: 5, patienceSec: 90, hours: { ...WEEKDAY_HOURS },
  },
  {
    id: 'mulbit-telecom', name: '물빛 통신', industry: '인터넷·휴대폰 통신', nation: 'kamuen', start: true,
    slTarget: { pct: 80, sec: 30 }, monthlyFee: 16000,
    callsPerDay: 80, ahtMin: 6, patienceSec: 75, hours: { ...WEEKDAY_HOURS },
  },
  {
    id: 'dalbit-mall', name: '달빛몰', industry: '온라인 쇼핑', nation: 'kamuen', start: false,
    slTarget: { pct: 90, sec: 15 }, monthlyFee: 24000,
    callsPerDay: 80, ahtMin: 4, patienceSec: 60, hours: { ...WEEKDAY_HOURS },
  },
  // v1.2: offered after expansion 1 (requiresOfficeLevel 1). callsPerDay set by the v1.2
  // balance task (balance record, v1.2 section): they arrive once calls have grown
  // (x1.14, up to x1.28 after expansion 1), so 70 grows to about 90; four agents
  // mostly meet the weekday client and a crew of three the weekend one, whose
  // 09:00-18:00 window sees about 80% of the daily CURVE.
  {
    id: 'bandi-repair', name: '반딧불 가전', industry: '가전 수리 접수', nation: 'kamuen', start: false,
    slTarget: { pct: 80, sec: 30 }, monthlyFee: 17000, requiresOfficeLevel: 1,
    callsPerDay: 70, ahtMin: 5, patienceSec: 90, hours: { ...WEEKDAY_HOURS },
  },
  {
    id: 'baram-delivery', name: '바람개비 배달', industry: '음식 배달 주문', nation: 'veltora', start: false,
    slTarget: { pct: 80, sec: 20 }, monthlyFee: 9000, requiresOfficeLevel: 1,
    callsPerDay: 60, ahtMin: 4, patienceSec: 60, hours: { days: [5, 6], open: 540, close: 1080 },
  },
];
