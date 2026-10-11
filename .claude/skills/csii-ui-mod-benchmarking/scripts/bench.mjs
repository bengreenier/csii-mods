// Better Asset Menu benchmark: drives the open menu over CDP (Gameface on :9444)
// and measures frame stalls with Date.now() + requestAnimationFrame. Works in
// either menu style (Pane or Radial; switch with cs2-in-game-test settings.mjs).
//
//   node bench.mjs [rounds=3] [--json out.json] [--only a,b]
//
// Per action: `lat` = ms from the action until the last long frame (gap > 20 ms)
// ended (or the first frame, if none), `max` = longest frame gap, `jank` = sum of
// (gap - 7) over long frames. Needs a city loaded, the menu closed,
// and the open key on its default (Tab). Scenarios: open, rootType, browse,
// page, favorites, smoke (result fingerprints, not timed), idle. The browse and
// smoke places assume Find It and Platter are in the playset.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// win.ps1 from the cs2-in-game-test skill, for the real key press that opens the menu.
const WIN_PS1 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../cs2-in-game-test/scripts/win.ps1");
const argv = process.argv.slice(2);
const rounds = Number(argv.find((a) => /^\d+$/.test(a)) ?? 3);
const jsonOut = argv.includes("--json") ? argv[argv.indexOf("--json") + 1] : null;
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1].split(",") : null;

import { LIB } from "./lib.mjs";

async function connect() {
  const list = await (await fetch("http://127.0.0.1:9444/json/list")).json();
  const ws = new WebSocket(list[0].webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error("ws error")); });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { try { const x = JSON.parse(m.data); if (x.id && pending.has(x.id)) { pending.get(x.id)(x); pending.delete(x.id); } } catch {} };
  const send = (method, params = {}) => new Promise((ok, fail) => {
    const n = ++id; const timer = setTimeout(() => { pending.delete(n); fail(new Error(method + " timed out")); }, 60000);
    pending.set(n, (x) => { clearTimeout(timer); ok(x); }); ws.send(JSON.stringify({ id: n, method, params }));
  });
  const ev = async (body) => {
    const r = await send("Runtime.evaluate", { expression: `(async () => { ${LIB}\n${body}\n})()`, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };
  return { send, ev, close: () => ws.close() };
}

const press = (key) => execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", WIN_PS1, "press", "Cities2", key], { stdio: "ignore" });
const trigger = (c, name, ...args) => c.ev(`engine.trigger(${JSON.stringify(name)}, ...${JSON.stringify(args)}); return 1;`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };

async function closeMenu(c) {
  await trigger(c, "BetterAssetMenu.close");
  await c.ev(`return B.measure(null, { pred: () => !B.field(), quietMs: 300 });`);
  await sleep(500);
}

// Watches frames while an OS key opens the menu.
async function openMenu(c) {
  await c.ev(`B.mon = B.measure(null, { pred: () => B.ready(), quietMs: 400 }); return 1;`);
  press("tab");
  const r = await c.ev(`return B.mon;`);
  if (r.timeout) throw new Error("menu did not open");
  return r;
}

async function typeKeys(c, from, to) {
  // Builds the sequence of query values from `from` to `to` one key at a time.
  const seq = [];
  let q = from;
  while (q !== to) {
    q = to.startsWith(q) && q.length < to.length ? to.slice(0, q.length + 1) : q.slice(0, -1);
    seq.push(q);
  }
  const res = [];
  for (const v of seq) res.push(await c.ev(`return B.measure(() => B.setQuery(${JSON.stringify(v)}), { quietMs: 250 });`));
  return res;
}

const click = (c, name) => c.ev(`return B.measure(() => B.select(${JSON.stringify(name)}), { quietMs: 300 });`);

// An asset entity on the current (results) page, from a row's React fiber.
async function anyAssetEntity(c) {
  return c.ev(`
    for (const el of document.querySelectorAll("img")) {
      let f = el[Object.keys(el).find((k) => k.startsWith("__reactFiber"))];
      for (let d = 0; f && d < 12; d++, f = f.return) {
        const a = f.memoizedProps?.item?.asset;
        if (a?.entity) return a.entity;
      }
    }
    return null;`);
}

const SCENARIOS = {
  // Opening the menu (C# RefreshAllAssets + favorites; session mount).
  async open(c, out) {
    out.open = await openMenu(c);
    await closeMenu(c);
  },
  // Root search typed key by key, then deleted key by key, then retyped.
  async rootType(c, out) {
    await openMenu(c);
    const t = await typeKeys(c, "", "residential");
    out.rootType1 = t[0];
    out.rootTypeRest = { lat: median(t.slice(1).map((x) => x.lat)), max: Math.max(...t.slice(1).map((x) => x.max)), jank: t.slice(1).reduce((s, x) => s + x.jank, 0) };
    out.rootTypeFooter = await c.ev(`return B.footer();`);
    const b = await typeKeys(c, "residential", "");
    out.rootBackspace = { lat: median(b.map((x) => x.lat)), max: Math.max(...b.map((x) => x.max)), jank: b.reduce((s, x) => s + x.jank, 0) };
    const again = await typeKeys(c, "", "r");
    out.rootRetype1 = again[0];
    // A filter query (sizes/zones): exercises the hint/parse path.
    const f = await typeKeys(c, "r", "r zone:residential");
    out.rootFilterType = { lat: median(f.map((x) => x.lat)), max: Math.max(...f.map((x) => x.max)), jank: f.reduce((s, x) => s + x.jank, 0) };
    await closeMenu(c);
  },
  // Browsing: a vanilla menu + category, then Find It's 12k-item subcategory.
  async browse(c, out) {
    await openMenu(c);
    out.browseMenu = await click(c, "Zones");
    out.browseCategory = await click(c, "ZonesResidential");
    await closeMenu(c);
    await openMenu(c);
    out.browseFindIt = await click(c, "Find It");
    out.browseFindItProps = await click(c, "Props");
    out.browseFindItBranding = await click(c, "Props_Branding");
    out.brandingFooter = await c.ev(`return B.footer();`);
    const t = await typeKeys(c, "", "coca");
    out.brandingType1 = t[0];
    out.brandingTypeRest = { lat: median(t.slice(1).map((x) => x.lat)), max: Math.max(...t.slice(1).map((x) => x.max)), jank: t.slice(1).reduce((s, x) => s + x.jank, 0) };
    await closeMenu(c);
  },
  // Paging a big result set: PgDn x5 then PgUp x5 on "residential".
  async page(c, out) {
    await openMenu(c);
    out.view = await c.ev(`return B.view();`);
    await typeKeys(c, "", "residential");
    await c.ev(`return B.measure(null, { quietMs: 600 });`);
    const steps = [];
    for (const s of [1, 1, 1, 1, 1, -1, -1, -1, -1, -1]) steps.push(await c.ev(`return B.measure(() => B.page(${s}), { quietMs: 250 });`));
    out.page = { lat: median(steps.map((x) => x.lat)), max: Math.max(...steps.map((x) => x.max)), jank: steps.reduce((s, x) => s + x.jank, 0) };
    out.pageFooter = await c.ev(`return B.footer();`);
    await closeMenu(c);
  },
  // Favorites: add then remove one asset with the menu closed (background
  // record rebuilds), and once more with the menu open on a search.
  async favorites(c, out) {
    await openMenu(c);
    await typeKeys(c, "", "tree");
    const entity = await anyAssetEntity(c);
    if (!entity) throw new Error("no asset entity found");
    out.favOpenAdd = await c.ev(`return B.measure(() => engine.trigger("BetterAssetMenu.addFavorite", ${JSON.stringify(entity)}), { quietMs: 600 });`);
    out.favOpenRemove = await c.ev(`return B.measure(() => engine.trigger("BetterAssetMenu.removeFavorite", ${JSON.stringify(entity)}), { quietMs: 600 });`);
    await closeMenu(c);
    out.favClosedAdd = await c.ev(`return B.measure(() => engine.trigger("BetterAssetMenu.addFavorite", ${JSON.stringify(entity)}), { quietMs: 1000 });`);
    out.favClosedRemove = await c.ev(`return B.measure(() => engine.trigger("BetterAssetMenu.removeFavorite", ${JSON.stringify(entity)}), { quietMs: 1000 });`);
  },
  // Behaviour fingerprint (not timed): result keys for fixed queries and places.
  async smoke(c, out) {
    const sig = async (q) => { await c.ev(`return B.measure(() => B.setQuery(${JSON.stringify(q)}), { quietMs: 600 });`); return c.ev(`return B.sig();`); };
    await openMenu(c);
    for (const q of ["residential", "tree", "zone:residential", "coca", "parcel", "w:4 d:4", "theme:european", "-tree pine", "fx:crime", "cat:decals", "level:5"]) out["sig " + q] = await sig(q);
    await sig("");
    out["sig root"] = await c.ev(`return B.sig();`);
    for (const [path, name] of [[["Zones", "ZonesResidential"], "zonesRes"], [["Zones", "PlatterCat"], "platter"], [["Landscaping", "PropsDecals"], "decals"], [["Find It", "Props", "Props_Branding"], "branding"]]) {
      for (const p of path) await click(c, p);
      out["sig " + name] = await c.ev(`return B.sig();`);
      out["sig " + name + " +road"] = await sig("road");
      await sig("");
      await closeMenu(c); await openMenu(c);
    }
    // Favorites persist: add one, see it in the Favorites level, remove it.
    await sig("tree");
    const entity = await anyAssetEntity(c);
    await trigger(c, "BetterAssetMenu.addFavorite", entity); await sleep(500);
    await sig(""); await click(c, "Favorites");
    out["sig favorites+1"] = await c.ev(`return B.sig();`);
    await trigger(c, "BetterAssetMenu.removeFavorite", entity); await sleep(500);
    out["sig favorites"] = await c.ev(`return B.sig();`);
    await closeMenu(c);
  },
  // Idle frames with the menu closed, and open at the root: the cost of just being there.
  async idle(c, out) {
    out.idleClosed = await c.ev(`return B.measure(null, { quietMs: 2000 });`);
    await openMenu(c);
    out.idleOpen = await c.ev(`return B.measure(null, { quietMs: 2000 });`);
    await closeMenu(c);
  },
};

const c = await connect();
const all = [];
try {
  if (await c.ev(`return !!B.field();`)) await closeMenu(c);
  for (let r = 0; r < rounds; r++) {
    const out = {};
    for (const [name, fn] of Object.entries(SCENARIOS)) {
      if (only && !only.includes(name)) continue;
      try { await fn(c, out); } catch (e) { out[name + "Error"] = e.message; try { await closeMenu(c); } catch {} }
    }
    all.push(out);
    console.error(`round ${r + 1}: ${JSON.stringify(out)}`);
  }
} finally {
  try { await closeMenu(c); } catch {}
  c.close();
}

// Summary: median (min-max) of lat / max / jank per metric.
const keys = [...new Set(all.flatMap((o) => Object.keys(o)))];
const rows = [];
for (const k of keys) {
  const vals = all.map((o) => o[k]).filter((v) => v !== undefined);
  if (typeof vals[0] !== "object") { rows.push(`${k.padEnd(22)} ${vals.join(" / ")}`); continue; }
  const f = (m) => { const xs = vals.map((v) => v[m]); return `${median(xs)} (${Math.min(...xs)}-${Math.max(...xs)})`; };
  rows.push(`${k.padEnd(22)} lat ${f("lat").padEnd(18)} max ${f("max").padEnd(18)} jank ${f("jank")}`);
}
console.log(rows.join("\n"));
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(all, null, 2));
