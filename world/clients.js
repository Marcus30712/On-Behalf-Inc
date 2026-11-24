// Fees are placeholder values. callsPerDay, ahtMin and patienceSec are not in the
// approved copy: starting values to be tuned in the balance task.
const WEEKDAY_HOURS = { days: [0, 1, 2, 3, 4], open: 540, close: 1260 };

export const CLIENTS = [
  {
    id: 'gureum-travel', name: '구름다리 여행', industry: '온라인 여행 예약', nation: 'veltora', start: true,
    slTarget: { pct: 80, sec: 20 }, monthlyFee: 18000,
    callsPerDay: 360, ahtMin: 5, patienceSec: 90, hours: { ...WEEKDAY_HOURS },
  },
  {
    id: 'mulbit-telecom', name: '물빛 통신', industry: '인터넷·휴대폰 통신', nation: 'kamuen', start: true,
    slTarget: { pct: 80, sec: 30 }, monthlyFee: 16000,
    callsPerDay: 320, ahtMin: 6, patienceSec: 75, hours: { ...WEEKDAY_HOURS },
  },
  {
    id: 'dalbit-mall', name: '달빛몰', industry: '온라인 쇼핑', nation: 'kamuen', start: false,
    slTarget: { pct: 90, sec: 15 }, monthlyFee: 24000,
    callsPerDay: 420, ahtMin: 4, patienceSec: 60, hours: { ...WEEKDAY_HOURS },
  },
];
