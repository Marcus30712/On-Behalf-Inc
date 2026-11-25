// cost and buildHours are not in the approved copy; set by the balance task
// (builds end during the next working day, when the people they help are there).
export const RESEARCH = [
  {
    id: 'rest-room', name: '휴게실 개선',
    blurb: '푹신한 소파와 조용한 조명을 들여요. 쉬는 동안 피로와 스트레스가 더 빨리 풀려요.',
    cost: 60, buildHours: 20, effect: { restRecoveryMul: 1.5 },
    doneText: '휴게실이 새로 단장됐어요. {name} 씨가 소파에 앉아 오랜만에 길게 숨을 내쉬어요.',
  },
  {
    id: 'stress-training', name: '스트레스 관리 교육',
    blurb: '힘든 통화 뒤 마음을 다스리는 법을 함께 배워요. 응대 중 스트레스가 덜 쌓여요.',
    cost: 80, buildHours: 24, effect: { stressGainMul: 0.8 },
    doneText: '교육이 끝났어요. {name} 씨가 배운 호흡법을 바로 써 보더니 어깨가 한결 가벼워졌어요.',
  },
  {
    id: 'clinic', name: '의무실',
    blurb: '작은 의무실과 상주 간호사를 둬요. 아픈 사람이 더 빨리 돌아와요.',
    cost: 100, buildHours: 16, effect: { sickDaysMul: 0.6 },
    doneText: '의무실이 문을 열었어요. {name} 씨의 병가가 {days}일로 줄었어요. 곧 얼굴을 볼 수 있겠어요.',
  },
  {
    id: 'flexible-shifts', name: '유연 근무',
    blurb: '근무 시간을 사람에게 맞춰 나누거나 옮길 수 있어요. 피로가 덜 쌓여요.',
    cost: 120, buildHours: 24, effect: { flexibleShifts: true, fatigueGainMul: 0.85 },
    doneText: '이제 근무 시간을 나눠 쓸 수 있어요. {name} 씨가 자기 리듬에 맞는 시간표를 받고 활짝 웃어요.',
  },
  // v1.3: effect-free; finishing one only lets its channel client be offered. cost and
  // buildHours are placeholders for the v1.3 balance task.
  {
    id: 'chat-desk', name: '채팅 창구',
    blurb: '상담 화면에 채팅 창을 붙이고, 짧고 또렷하게 쓰는 법을 익혀요. 채팅 상담 계약을 받을 수 있어요.',
    cost: 90, buildHours: 20, effect: {},
    doneText: '채팅 창구가 열렸어요. {name} 씨가 첫 인사 문장을 몇 번이나 고쳐 써 보네요.',
  },
  {
    id: 'mail-desk', name: '메일 창구',
    blurb: '메일함을 고객사별로 나누고 답장 서식을 만들어요. 이메일 상담 계약을 받을 수 있어요.',
    cost: 90, buildHours: 20, effect: {},
    doneText: '메일 창구가 열렸어요. {name} 씨가 답장 서식을 벽에 붙여 두었어요.',
  },
];
