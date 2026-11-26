// Kim Miso's advice: one random line per event.
export const ADVISOR = {
  sick: ['아픈 건 누구 잘못도 아니에요. 오늘은 남은 사람들 배치만 다시 봐 주세요.', '의무실 연구가 있으면 이런 날이 훨씬 짧아져요.'],
  burnout: ['번아웃은 하루아침에 오지 않아요. 스트레스 막대가 오래 빨갛던 사람을 먼저 챙겨 주세요.', '{name} 씨가 돌아오면 첫 주는 조금 가볍게 맡겨 주세요.'],
  'no-show': ['혼내기 전에 먼저 안부를 물어봐요. 이유가 있을 거예요.'],
  argument: ['한 통화로 사람을 판단하지 말아요. 요즘 {name} 씨가 얼마나 지쳤는지 먼저 봐 주세요.', '코칭 시간을 조금만 내 주면 다음엔 달라질 거예요.'],
  'resign-notice': ['정든 사람을 보내는 건 늘 아파요. 붙잡든 보내든, 이야기는 꼭 들어 주세요.', '사람이 떠나는 이유는 대개 돈보다 피로예요.'],
  'holiday-leave': ['명절에 가족을 못 보면 일도 손에 안 잡혀요. 웬만하면 보내 주세요.', '휴일 달력을 미리 보면 이런 날을 대비할 수 있어요.'],
  'friday-off': ['우리 센터의 주말과 {name} 씨의 주말이 달라요. 서로 조금씩 맞춰 가요.'],
  'call-spike': ['연휴 다음 날은 늘 이래요. 덜 바쁜 고객사에서 한두 명 옮겨 와요.', '대기 시간이 길어지면 끊는 고객이 늘어요. 지금은 전화부터요.'],
  'client-offer': ['큰 기회예요. 다만 지금 인원으로 버틸 수 있는지 먼저 따져 봐요.'],
  // v1.2: used instead of the line above when the offered client works weekends.
  'client-offer-weekend': ['주말 일은 누가 쉬는지까지 같이 짜야 해요. 한 사람이 일주일 내내 일하지 않게요.'],
  // v1.3: used instead of 'client-offer' for chat and email clients; backlog-growing is the advice for backlog-warning.
  'client-offer-chat': ['채팅은 동시에 받으니 사람이 적어 보여도 돼요. 다만 한 건이 길어지는 건 각오해야 해요.'],
  'client-offer-email': ['메일은 조용히 쌓여요. 한가한 사람이 생기면 메일부터 맡겨 봐요.'],
  'backlog-growing': ['{client} 메일이 {n}통 밀렸어요. 오늘 안에 다 못 보면 내일 아침이 더 무거워요.'],
  'expansion-start': ['공사하는 동안에도 전화는 와요. 배치는 평소처럼 챙겨 주세요.', '넓히는 건 좋지만, 자리를 채울 사람과 돈도 같이 생각해 봐요.'],
  'expansion-done': ['새 책상 냄새가 좋네요! 서두르지 말고 한 명씩 잘 뽑아요.', '자리가 늘었다고 바로 다 채울 필요는 없어요. 임대료도 잊지 마세요.'],
  'churn-warning': ['아직 늦지 않았어요. 그 고객사에 사람을 더 붙이고 목표부터 맞춰요.'],
  'research-done': ['연구 끝! 공사만 끝나면 바로 효과가 나요.'],
  'build-done': ['보세요, {name} 씨 얼굴이 달라졌죠? 이게 센터장님이 한 일이에요.'],
  // v1.7: lead-candidate, and resign-notice-lead in place of resign-notice when a lead hands in notice.
  'lead-candidate': ['휴식표는 팀장 솜씨예요. 스케줄링이 높을수록 바쁜 시간을 잘 피해서 쉬게 해요.'],
  'resign-notice-lead': ['팀장이 떠나면 휴식표를 짤 사람이 없어요. 채용 탭에서 새 팀장을 미리 찾아 둬요.'],
  candidate: ['기술은 가르치면 늘어요. 우리 팀과 잘 맞을 사람을 골라요.'],
  'game-over-cash': ['이번엔 여기까지예요. 그래도 많이 배웠잖아요. 다시 해 봐요, 센터장님.'],
  'game-over-clients': ['고객사가 떠난 건 아프지만, 무엇이 흔들렸는지 이제 알잖아요. 다시 시작해요.'],
  'milestone-big-client': ['고객사 세 곳이라니! 처음 문 열던 날이 생각나네요.'],
  'milestone-rank-s': ['S등급이에요. 사람을 아껴서 얻은 등급이라 더 값져요.'],
  'breaks-auto': ['팀장이 없는 날엔 휴식표가 엉성해져요. 오늘은 서비스 레벨을 자주 봐 주세요.'],
};
