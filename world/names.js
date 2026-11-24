// Invented names. veltora: surname + given name; kamuen: single name.
const veltoraSurnames = ['단', '오르', '펠', '비스', '토', '메른'];
const veltoraGiven = [
  '토벤', '리셀', '마로', '에핀', '소랭', '부엘',
  '니아로', '테산', '오멜', '카린타', '펠루', '하펠',
  '지벨', '로웬', '모사', '이르덴', '베니카', '순테',
  '아델로', '쿠림', '파셀', '엘루네',
];
const kamuenNames = [
  '미루안', '케피', '도엔', '유라밋', '세토', '바이루',
  '오카탄', '리무', '자엔', '필로아', '하누', '테미오',
  '쿠엔다', '소비라', '나쿠', '에루', '야무', '보르카',
  '니포', '라우사', '체니', '무알로', '고엔',
];

// 6 x 22 = 132 unique full names.
const veltoraNames = veltoraSurnames.flatMap((s) => veltoraGiven.map((g) => `${s} ${g}`));

export const NAMES = {
  veltora: veltoraNames,
  kamuen: kamuenNames,
};
