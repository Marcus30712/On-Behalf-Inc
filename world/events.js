// Templates: {name} {client} {holiday} {nation} {days} {research} {hours} {stage} {seats} {sl} {fee} {cand1} {cand2}.
// build-done shows the research's doneText ({doneText}); textNobody is used when nobody is helped.
export const EVENTS = {
  sick: { title: '{name} 씨가 아파요', text: '{name} 씨가 몸살로 {days}일 쉬어야 해요. 그동안 {client} 응대 인원이 한 명 줄어요.' },
  burnout: { title: '{name} 씨가 지쳤어요', text: '{name} 씨가 오랫동안 큰 스트레스를 견뎌 왔어요. {days}일 동안 번아웃 휴가에 들어가요.' },
  'no-show': { title: '{name} 씨가 안 나왔어요', text: '{name} 씨가 오늘 출근하지 않았고 연락도 닿지 않아요. 요즘 많이 힘들어 보였어요.' },
  argument: { title: '통화 중 언쟁이 있었어요', text: '{name} 씨가 {client} 고객과 통화하다 언성이 높아졌어요. 고객사 만족도와 평판이 조금 내려갔어요.' },
  'call-spike': { title: '{client}에 전화가 몰려요', text: '{client} 전화가 평소보다 크게 늘었어요. 대기 시간이 길어지고 있어요.' },
  'churn-warning': { title: '{client}가 계약 해지를 경고했어요', text: '{client}의 만족도가 바닥까지 내려갔어요. {days}근무일 안에 나아지지 않으면 계약을 끝내겠대요.' },
  'research-done': { title: '{research} 연구 완료', text: '{research} 연구가 끝났어요. 바로 공사를 시작해요. {hours}시간 뒤에 완공돼요.' },
  'build-done': {
    title: '{research} 완공',
    text: '{doneText}',
    textNobody: '{research}이(가) 완공됐어요. 다들 반가워해요.',
  },
  'game-over-cash': { title: '센터 문을 닫아요', text: '돈이 바닥나 이번 달 급여를 줄 수 없어요. 센터는 여기서 문을 닫아요. 함께한 {days}일, 고마웠어요.' },
  'game-over-clients': { title: '마지막 고객사가 떠났어요', text: '남은 고객사가 하나도 없어요. 받을 전화가 없어 센터는 여기서 문을 닫아요. 함께한 {days}일, 고마웠어요.' },
  'milestone-big-client': { title: '이정표: 고객사 세 곳', text: '이제 고객사 세 곳의 전화를 함께 받아요. 작은 센터가 여기까지 왔어요.' },
  'milestone-rank-s': { title: '이정표: 평판 S등급', text: '평판이 S등급에 올랐어요. 모두가 함께 만든 결과예요.' },
  'holiday-leave': {
    title: '{name} 씨의 휴가 신청',
    text: '내일부터 {holiday}예요. {name} 씨가 고향 가족과 보내려고 휴가를 신청했어요.',
    choices: [
      { id: 'grant', label: '휴가를 허락한다', result: '{name} 씨가 휴가를 떠나요. 사기가 올라요.' },
      { id: 'refuse', label: '이번엔 근무를 부탁한다', result: '{name} 씨의 사기가 크게 떨어져요. 그날 결근할 수도 있어요.' },
    ],
  },
  'friday-off': {
    title: '금요일 휴무 요청',
    text: '{nation}에서는 별날(금)이 쉬는 날이에요. {name} 씨가 이번 별날에 쉬고 싶어 해요.',
    choices: [
      { id: 'change', label: '근무표를 바꿔 준다', result: '{name} 씨의 사기가 올라요. 그날 근무 인원은 한 명 줄어요.' },
      { id: 'keep', label: '그대로 둔다', result: '근무표는 그대로예요. {name} 씨의 사기가 조금 내려가요.' },
    ],
  },
  'resign-notice': {
    title: '{name} 씨의 퇴사 예고',
    text: '{name} 씨가 {days}근무일 뒤에 그만두겠다고 했어요. 많이 지쳐 보여요.',
    choices: [
      { id: 'keep-trying', label: '면담하고 붙잡아 본다', result: '따로 시간을 내 이야기를 들어요. 사기가 다시 오르면 마음을 바꿀 수도 있어요.' },
      { id: 'let-go', label: '보내 준다', result: '마지막 날까지 잘 마무리하도록 도와요. {days}근무일 뒤 {name} 씨가 떠나요.' },
    ],
  },
  candidate: {
    title: '지원자 두 명이 왔어요',
    text: '{cand1} 씨와 {cand2} 씨가 면접을 봤어요. 누구와 함께할까요?',
    choices: [
      { id: 'pick-1', label: '{cand1} 씨를 뽑는다', result: '{cand1} 씨가 수습 상담사로 들어와요. 처음 두 주는 교육이 필요해요.' },
      { id: 'pick-2', label: '{cand2} 씨를 뽑는다', result: '{cand2} 씨가 수습 상담사로 들어와요. 처음 두 주는 교육이 필요해요.' },
      { id: 'hold', label: '이번엔 보류한다', result: '아무도 뽑지 않아요. 다시 뽑으려면 채용을 새로 시작해야 해요.' },
    ],
  },
  'client-offer': {
    title: '새 고객사 제안',
    text: '{client}에서 계약을 제안했어요. 목표는 {sl}, 월 계약금은 {fee}예요. 좌석이 8개뿐이라 지금 인원을 나눠야 해요.',
    choices: [
      { id: 'accept', label: '계약한다', result: '{client}가 새 고객사가 돼요. 상담사를 세 고객사에 나눠 배치하세요.' },
      { id: 'decline', label: '정중히 거절한다', result: '지금 인원으로 지금 고객사에 집중해요.' },
    ],
    // v1.2 variants (ui/text.js eventText picks): after an expansion, for a weekend client, and a re-offer.
    textMore: '{client}에서 계약을 제안했어요. 목표는 {sl}, 월 계약금은 {fee}예요. 받으면 지금 인원을 나눠야 해요.',
    textWeekend: '{client}에서 주말 계약을 제안했어요. 토·일 09:00~18:00에 전화를 받아요. 목표는 {sl}, 월 계약금은 {fee}예요.',
    acceptMore: '{client}가 새 고객사가 돼요. 업무 배치에서 응대 인원을 정해 주세요.',
    acceptWeekend: '{client}가 새 고객사가 돼요. 근무표에 토·일 칸이 생겼어요. 주말 조를 짜 주세요.',
    // v1.3 channel variants: chosen before the weekend/more variants.
    textChat: '{client}에서 채팅 상담 계약을 제안했어요. 한 사람이 채팅 두 건을 함께 받아요. 목표는 {sl}, 월 계약금은 {fee}예요.',
    textEmail: '{client}에서 이메일 상담 계약을 제안했어요. 메일은 쌓아 두었다가 답해도 되지만 기한이 있어요. 목표는 {sl}, 월 계약금은 {fee}예요.',
    acceptChat: '{client}가 새 고객사가 돼요. 업무 배치에서 채팅을 맡을 사람을 정해 주세요.',
    acceptEmail: '{client}가 새 고객사가 돼요. 업무 배치에서 메일을 맡을 사람을 정해 주세요. 아무도 없으면 메일이 계속 쌓여요.',
    again: '예전에 인연이 닿지 않았던 {client}에서 다시 연락이 왔어요.',
  },
  'backlog-warning': { title: '{client} 메일이 밀려요', text: '답장을 기다리는 메일이 {n}통이에요. 기한을 넘긴 메일이 늘면 {client}의 만족도가 떨어져요.' },
  'expansion-start': { title: '{stage} 공사 시작', text: '{stage} 공사를 시작했어요. {days}근무일 뒤에 완공돼요. 그동안 조금 시끄러울 거예요.' },
  'expansion-done': { title: '{stage} 완공', text: '{stage}이 문을 열었어요. 이제 상담사 좌석이 {seats}개예요. 채용 탭에서 새 사람을 뽑을 수 있어요.' },
};
