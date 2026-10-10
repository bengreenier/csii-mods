// node profile.mjs '<setup js body>' '<action js body>' [waitMs]
// Profiles `action` (run after `setup`), prints top self and inclusive time.
import { readFileSync } from "node:fs";
const [setup, action, waitMs = "800"] = process.argv.slice(2);
import { LIB } from "./lib.mjs";
const list = await (await fetch("http://127.0.0.1:9444/json/list")).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { try { const x = JSON.parse(m.data); if (x.id && pend.has(x.id)) { pend.get(x.id)(x); pend.delete(x.id); } } catch {} };
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pend.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (body) => { const r = await send("Runtime.evaluate", { expression: `(async () => { ${LIB}\n${body}\n})()`, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result?.result?.value; };
await send("Profiler.enable");
await send("Profiler.setSamplingInterval", { interval: 100 });
if (setup) await ev(setup);
await send("Profiler.start");
await ev(action);
await new Promise((r) => setTimeout(r, Number(waitMs)));
const { result } = await send("Profiler.stop");
ws.close();
const p = result.profile;
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const dt = (p.endTime - p.startTime) / 1000 / Math.max(1, p.samples.length);
const name = (n) => `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber}:${n.callFrame.columnNumber}`;
const self = new Map(); const incl = new Map(); const parent = new Map();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
for (const s of p.samples) {
  const n = byId.get(s); self.set(name(n), (self.get(name(n)) ?? 0) + dt);
  const seen = new Set();
  for (let x = s; x !== undefined; x = parent.get(x)) { const k = name(byId.get(x)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) ?? 0) + dt); } }
}
const top = (m, k) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k).map(([n, t]) => `${t.toFixed(1).padStart(8)} ms  ${n}`).join("\n");
console.log(`samples ${p.samples.length}, ${dt.toFixed(3)} ms each, total ${((p.endTime - p.startTime) / 1000).toFixed(0)} ms`);
console.log("--- self ---\n" + top(self, 25));
console.log("--- inclusive ---\n" + top(incl, 40));
