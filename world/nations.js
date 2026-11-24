// Two nations. Holiday shape: sim/calendar.js Holiday + name, blurb.
// staffLeave = chance a native employee requests leave the day before.
export const NATIONS = [
  {
    id: 'veltora',
    name: '벨토라',
    blurb: '강과 다리가 많은 넓은 평원의 나라. 공통력을 그대로 쓰고 휴일 날짜가 해마다 같다.',
    weeklyRest: [5, 6],
    holidays: [
      {
        id: 'year-turn', name: '해넘이 연휴',
        blurb: '묵은해를 보내고 새해를 맞는 가장 긴 연휴. 고향에 모여 함께 밤을 새운다.',
        rule: { kind: 'fixed', month: 12, date: 29 }, length: 5, staffLeave: 0.6,
        callEffect: { during: 0.5, after: 1.4, afterDays: 2 },
      },
      {
        id: 'seed-day', name: '씨앗날',
        blurb: '봄에 첫 씨앗을 심는 날. 가까운 들로 나들이를 간다.',
        rule: { kind: 'fixed', month: 3, date: 15 }, length: 1, staffLeave: 0.2,
        callEffect: { during: 0.7, after: 1.1, afterDays: 1 },
      },
      {
        id: 'bridge-day', name: '다리의 날',
        blurb: '강가 마을들이 하나의 나라로 이어진 것을 기념하는 날.',
        rule: { kind: 'fixed', month: 5, date: 10 }, length: 1, staffLeave: 0.15,
        callEffect: { during: 0.6, after: 1.1, afterDays: 1 },
      },
      {
        id: 'long-sun', name: '긴 햇살 주간',
        blurb: '해가 가장 긴 무렵 사흘을 쉬며 물가로 여행을 떠난다.',
        rule: { kind: 'fixed', month: 7, date: 20 }, length: 3, staffLeave: 0.4,
        callEffect: { during: 0.6, after: 1.3, afterDays: 2 },
      },
      {
        id: 'harvest', name: '거둠 연휴',
        blurb: '한 해 수확을 축하하며 가족이 모여 음식을 나눈다.',
        rule: { kind: 'fixed', month: 9, date: 25 }, length: 3, staffLeave: 0.5,
        callEffect: { during: 0.5, after: 1.5, afterDays: 2 },
      },
      {
        id: 'thanks-day', name: '고마움의 날',
        blurb: '한 해 고마웠던 사람에게 작은 선물을 보내는 날. 주문·배송 문의가 늘어난다.',
        rule: { kind: 'fixed', month: 11, date: 8 }, length: 1, staffLeave: 0.25,
        callEffect: { during: 1.3, after: 1.0, afterDays: 0 },
      },
    ],
  },
  {
    id: 'kamuen',
    name: '카무엔',
    blurb: "바람 부는 고원과 항구 도시의 나라. 작은 달 '피올'을 따르는 피올력으로 휴일을 정해, 휴일이 해마다 11일쯤 앞당겨진다.",
    weeklyRest: [4, 5],
    holidays: [
      {
        id: 'first-wind', name: '첫바람 날',
        blurb: '겨울이 끝나고 고원에 첫 봄바람이 부는 것을 반기는 날.',
        rule: { kind: 'drifting', baseDay: 60, driftPerYear: 11 }, length: 1, staffLeave: 0.2,
        callEffect: { during: 0.8, after: 1.1, afterDays: 1 },
      },
      {
        id: 'quiet-month', name: '고요의 달',
        blurb: '한 달 동안 일을 줄이고 일찍 집에 돌아가 가족과 저녁을 보내는 기간. 근무 시간이 짧아진다.',
        rule: { kind: 'drifting', baseDay: 150, driftPerYear: 11 }, length: 30, staffLeave: 0.1,
        callEffect: { during: 0.85, after: 1.0, afterDays: 0 },
        staffAvail: 0.8,
      },
      {
        id: 'quiet-end', name: '맺음 잔치',
        blurb: '고요의 달이 끝나는 날부터 사흘 동안 여는 큰 잔치. 멀리 사는 가족도 모인다.',
        rule: { kind: 'drifting', baseDay: 180, driftPerYear: 11 }, length: 3, staffLeave: 0.7,
        callEffect: { during: 0.4, after: 1.6, afterDays: 3 },
      },
      {
        id: 'gathering', name: '모임 연휴',
        blurb: '친척들이 한 집에 모여 나흘 동안 먹고 이야기하는 연휴.',
        rule: { kind: 'drifting', baseDay: 250, driftPerYear: 11 }, length: 4, staffLeave: 0.6,
        callEffect: { during: 0.5, after: 1.4, afterDays: 2 },
      },
      {
        id: 'well-day', name: '우물의 날',
        blurb: '마을 우물을 함께 청소하고 물에 고마워하는 날.',
        rule: { kind: 'drifting', baseDay: 300, driftPerYear: 11 }, length: 1, staffLeave: 0.25,
        callEffect: { during: 0.7, after: 1.1, afterDays: 1 },
      },
      {
        id: 'new-cycle', name: '새 주기 연휴',
        blurb: '피올력의 새해. 다섯 날 동안 집을 정리하고 새 주기를 맞는다.',
        rule: { kind: 'drifting', baseDay: 357, driftPerYear: 11 }, length: 5, staffLeave: 0.55,
        callEffect: { during: 0.5, after: 1.3, afterDays: 2 },
      },
    ],
  },
];
