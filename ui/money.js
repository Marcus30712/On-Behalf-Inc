// Money display, shared by ui/text.js and ui/format.js (a leaf, so they do not import each other in a cycle).
export const formatMoney = (n) => Math.round(n).toLocaleString('en-US');
