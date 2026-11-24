// Traits are random per person and carry no nation.
export const TRAITS = [
  { id: 'meticulous', name: '꼼꼼함', blurb: '한 번 더 확인하고 넘어가요. 품질은 좋지만 조금 느려요.', effect: { qaMul: 1.2, ahtMul: 1.1 } },
  { id: 'hasty', name: '급함', blurb: '빨리 끝내는 데 능해요. 대신 실수가 잦아요.', effect: { ahtMul: 0.9, errorMul: 1.3 } },
  { id: 'warm', name: '다정함', blurb: '고객 마음을 잘 알아줘요. 그만큼 마음이 쉽게 닳아요.', effect: { csatAdd: 3, stressGainMul: 1.15 } },
  { id: 'steel-nerves', name: '강철 멘탈', blurb: '큰 소리가 나도 흔들리지 않아요.', effect: { stressGainMul: 0.7 } },
  { id: 'sturdy', name: '튼튼함', blurb: '긴 하루에도 쉽게 지치지 않아요.', effect: { fatigueGainMul: 0.8 } },
  { id: 'worrier', name: '걱정 많음', blurb: '작은 일도 오래 마음에 담아 둬요. 더 자주 다독여 주세요.', effect: { stressGainMul: 1.25, errorMul: 0.9 } },
  { id: 'calm-voice', name: '차분한 목소리', blurb: '목소리만 들어도 고객이 안심해요. 말이 조금 길어요.', effect: { csatAdd: 2, ahtMul: 1.05 } },
  { id: 'keyboard-whiz', name: '손이 빠름', blurb: '시스템 화면을 누구보다 빨리 다뤄요. 쉬는 걸 자주 잊어요.', effect: { ahtMul: 0.9, fatigueGainMul: 1.1 } },
];
