// node eval.mjs file.js - runs a script body in the game UI with lib.mjs's B
// helpers in scope (B.setQuery, B.select, B.back, B.level, B.sig, B.measure...)
// and prints its return value. No timeout: for long walks cdp.mjs can't do.
import { readFileSync } from "node:fs";
import { LIB } from "./lib.mjs";
const list = await (await fetch("http://127.0.0.1:9444/json/list")).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
ws.onmessage = (m) => { try { const x = JSON.parse(m.data); if (x.id === 1) { const r = x.result; console.log(r?.exceptionDetails ? r.exceptionDetails.exception?.description : JSON.stringify(r?.result?.value, null, 1)); ws.close(); } } catch {} };
ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: `(async () => { ${LIB}\n${readFileSync(process.argv[2], "utf8")} })()`, returnByValue: true, awaitPromise: true } }));
