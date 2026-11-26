// Money and decimal display, shared by ui/text.js and ui/format.js (a leaf, so they do not import each other in a cycle).
export const formatMoney = (n) => Math.round(n).toLocaleString('en-US');
// A share in percent or a decimal score, always 2 decimals (display rule 2026-11-26): 80 -> "80.00".
export const formatDecimal = (n) => Number(n).toFixed(2);
