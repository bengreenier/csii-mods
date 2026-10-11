// In-page helpers (window.__B, as `B`) prepended to every evaluation by
// bench.mjs, profile.mjs and eval.mjs. Better Asset Menu specific: finds the
// menu's search field and level model through React internals.
export const LIB = `
window.__B = window.__B || {};
const B = window.__B;
B.field = () => document.querySelector("input[class*=searchField]");
B.props = (el) => el[Object.keys(el).find((k) => k.startsWith("__reactProps"))];
B.setQuery = (q) => { const i = B.field(); if (!i) throw new Error("menu not open"); i.value = q; B.props(i).onChange({ target: i, currentTarget: i }); };
B.clickText = (text) => {
  const hits = [...document.querySelectorAll("*")].filter((e) => e.textContent.trim() === text && e.getBoundingClientRect().width > 0);
  const el = hits.find((e) => !hits.some((o) => o !== e && e.contains(o)));
  if (!el) throw new Error("no visible element with text " + text);
  const r = el.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, button: 0, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, view: window };
  for (const t of ["mousedown", "mouseup", "click"]) el.dispatchEvent(new MouseEvent(t, o));
};
B.session = () => { const i = B.field(); let f = i[Object.keys(i).find((k) => k.startsWith("__reactFiber"))]; while (f && !(f.memoizedProps && f.memoizedProps.backRef)) f = f.return; return f; };
B.level = () => { const st = [B.session().child]; while (st.length) { const n = st.pop(); if (n.memoizedProps?.level?.items) return n.memoizedProps.level; if (n.child) st.push(n.child); if (n.sibling) st.push(n.sibling); } };
B.select = (name) => { const it = B.level().items.find((i) => i.name === name); if (!it) throw new Error("no item " + name + " in " + B.level().items.slice(0, 30).map((i) => i.name)); it.onSelect(); };
B.back = () => B.session().memoizedProps.backRef.current();
B.itemKey = (i) => (i.key ?? "") + "|" + i.name + "|" + (i.disabled ? 1 : 0) + "|" + (i.place?.category ? "c" : "-");
B.sig = () => { const items = B.level().items; let h = 0; const s = items.map(B.itemKey).join(","); for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) | 0; return items.length + "#" + (h >>> 0).toString(16) + ":" + items.slice(0, 3).map((i) => i.name).join("/"); };
// The result count: the pane's footer ("1160 matches"), or the radial hub's
// line ("1-58 of 1160 matches", "1-58 of 12060"), only while searching or paging.
B.footer = () => [...document.querySelectorAll("div")].filter((d) => d.children.length === 0 && /^(\\d[\\d,]*-\\d[\\d,]* of \\d|\\d[\\d,]* (items|match|matches))/.test(d.textContent.trim())).map((d) => d.textContent.trim()).join("|");
B.view = () => (document.querySelector("[class*=wheel]") ? "radial" : "pane");
// Open and showing its items (the radial root has no count line to wait for).
B.ready = () => { if (!B.field()) return false; if (B.footer() !== "") return true; try { return B.level().items.length > 0; } catch { return false; } };
// PgDn (step 1) / PgUp (-1) through the field's own key handler.
B.page = (step) => { const i = B.field(); B.props(i).onKeyDown({ keyCode: step > 0 ? 34 : 33, currentTarget: i, target: i, preventDefault() {}, stopPropagation() {} }); };
// Runs action, then watches frames until quietMs pass with no long frame (and pred holds).
B.measure = (action, { pred = null, quietMs = 300, maxMs = 15000 } = {}) => new Promise((done) => {
  const t0 = Date.now();
  let last = t0, lastLong = null, firstFrame = null, max = 0, jank = 0, frames = 0, predAt = null;
  if (action) action();
  const step = () => {
    const now = Date.now(); const gap = now - last; last = now; frames++;
    if (firstFrame === null) firstFrame = now;
    if (gap > max) max = gap;
    if (gap > 20) { jank += gap - 7; lastLong = now; }
    if (predAt === null && (!pred || pred())) predAt = now;
    const settledAt = Math.max(lastLong ?? firstFrame, predAt ?? Infinity);
    if ((predAt !== null && now - settledAt >= quietMs) || now - t0 > maxMs) {
      done({ lat: settledAt - t0, max, jank, frames, timeout: now - t0 > maxMs });
    } else requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});
`;
