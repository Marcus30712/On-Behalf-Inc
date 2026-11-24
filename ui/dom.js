// Tiny DOM builder. Bound to a document passed in (never globalThis.document).
// h(tag, attrs, ...children): attrs 'class', 'data-*', 'aria-*', 'title' and
// others become attributes; on* functions become listeners; 'value',
// 'checked', 'selected' and 'disabled' are set as properties. Children may be
// strings, numbers, nodes, arrays, or null/false (skipped).
const PROPS = new Set(['value', 'checked', 'selected', 'disabled']);

export function builder(doc) {
  const append = (el, child) => {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach((c) => append(el, c)); return; }
    el.append(typeof child === 'object' ? child : doc.createTextNode(String(child)));
  };
  return function h(tag, attrs = {}, ...children) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs ?? {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (PROPS.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    append(el, children);
    return el;
  };
}
