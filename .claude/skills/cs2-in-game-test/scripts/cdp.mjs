// Minimal Chrome DevTools Protocol client for CS2's Gameface UI debugger.
// Needs the game started with -uiDeveloperMode (see game.sh), which serves
// the debugger on localhost:9444.
//
//   node cdp.mjs targets                 list debuggable views
//   node cdp.mjs eval '<js expression>'  evaluate in the game UI, print the result (JSON)
//   node cdp.mjs eval -f file.js         run a script body from a file (statements; `return` a value)
//   node cdp.mjs wait '<js expression>' [timeoutSec]
//                                        poll until the expression is truthy
//   node cdp.mjs value <group.name>      current value of a C# binding (e.g. menu.maps)
//   node cdp.mjs trigger <group.name> [jsonArg...]
//                                        fire a C# trigger binding
//   node cdp.mjs click '<text>' [selector]
//                                        click the visible element with exactly that text
//                                        (synthetic mouse events; default selector: buttons)
//   node cdp.mjs newgame [Map] [option=true|false...]
//                                        from the main menu, start a new city like the
//                                        New Game screen does (default Plains; options:
//                                        unlockAll unlimitedMoney unlockMapTiles
//                                        leftHandTraffic naturalDisasters - note the game
//                                        saves these as the user's new-game defaults)
//
// Expressions may be async (awaitPromise is on), and can use the helper
// `readBinding("group.name")`. Pick a view other than the first with
// CDP_TARGET=<substring of its url/title>.
import { readFileSync } from "node:fs";

// Prepended to every expression. Bindings follow the protocol of the UI's own
// ValueBinding (cs2/api bindValue): subscribe, take the first update, unsubscribe.
const PRELUDE = `const readBinding = (n) => new Promise((ok, fail) => {
  const h = engine.on(n + ".update", (v) => { h.clear(); engine.trigger(n + ".unsubscribe"); ok(v); });
  engine.trigger(n + ".subscribe");
  setTimeout(() => { h.clear(); fail(new Error("no update for binding " + n)); }, 5000);
});`;

const PORT = process.env.CDP_PORT ?? "9444";
const [cmd, ...args] = process.argv.slice(2);

async function targets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return res.json();
}

async function connect() {
  const list = await targets();
  const want = process.env.CDP_TARGET;
  const t = (want ? list.find((x) => `${x.url} ${x.title}`.includes(want)) : list[0]) ?? list[0];
  if (!t?.webSocketDebuggerUrl) throw new Error(`no debuggable target: ${JSON.stringify(list)}`);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error("websocket error")); });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((ok, fail) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); fail(new Error(`${method} timed out`)); }, 15000);
    pending.set(n, (msg) => { clearTimeout(timer); ok(msg); });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  return { send, close: () => ws.close() };
}

async function evaluate(conn, expression, isBody = false) {
  // Wrapped so `const`s don't collide between evaluations in the same view.
  const body = isBody ? expression : `return (${expression}\n);`;
  const wrapped = `(async () => { ${PRELUDE}\n${body}\n})()`;
  const msg = await conn.send("Runtime.evaluate", { expression: wrapped, returnByValue: true, awaitPromise: true });
  if (msg.error) throw new Error(JSON.stringify(msg.error));
  const r = msg.result;
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails));
  return r.result.value ?? r.result.description ?? r.result.type;
}

const print = (v) => console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));

async function run(expression, isBody) {
  const conn = await connect();
  try { print(await evaluate(conn, expression, isBody)); } finally { conn.close(); }
}

// Gameface has no HTMLElement.click(); dispatching the mouse events works with
// vanilla Button's onSelect. Text match is exact (trimmed); the innermost match wins.
function clickExpression(text, selector) {
  return `(() => {
    const hits = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .filter((e) => e.textContent.trim() === ${JSON.stringify(text)} && e.getBoundingClientRect().width > 0);
    const el = hits.find((e) => !hits.some((o) => o !== e && e.contains(o)));
    if (!el) throw new Error("nothing visible matching " + ${JSON.stringify(selector)} + " with text " + ${JSON.stringify(text)});
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, button: 0, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, view: window };
    for (const t of ["mousedown", "mouseup", "click"]) el.dispatchEvent(new MouseEvent(t, o));
    return "clicked <" + el.tagName.toLowerCase() + "> at " + Math.round(o.clientX) + "," + Math.round(o.clientY);
  })()`;
}

function newGameExpression(map, opts) {
  return `(async () => {
    const maps = await readBinding("menu.maps");
    const map = maps.find((m) => m.displayName === ${JSON.stringify(map)} || m.id === ${JSON.stringify(map)});
    if (!map) throw new Error("no map " + ${JSON.stringify(map)} + "; have: " + maps.map((m) => m.displayName).join(", "));
    const { __Type, ...defaults } = await readBinding("menu.defaultGameOptions");
    const modes = await readBinding("menu.gameModes");
    const args = { mapId: map.id, cityName: map.displayName + " Test", theme: map.theme,
      options: { ...defaults, ...${JSON.stringify(opts)} }, gameMode: modes.some((m) => m.id === "NormalMode") ? "NormalMode" : (modes[0]?.id ?? "") };
    engine.trigger("menu.newGame", args, false);
    return args;
  })()`;
}

try {
  if (cmd === "targets") {
    for (const t of await targets()) console.log(`${t.id}\t${t.title}\t${t.url}`);
  } else if (cmd === "eval") {
    if (args[0] === "-f") await run(readFileSync(args[1], "utf8"), true);
    else await run(args[0]);
  } else if (cmd === "value") {
    await run(`readBinding(${JSON.stringify(args[0])})`);
  } else if (cmd === "trigger") {
    const triggerArgs = args.slice(1).map((a) => JSON.parse(a));
    await run(`(engine.trigger(${JSON.stringify(args[0])}, ...${JSON.stringify(triggerArgs)}), "triggered ${args[0]}")`);
  } else if (cmd === "click") {
    await run(clickExpression(args[0], args[1] ?? "button, [role=button], [class*=button], [class*=item]"));
  } else if (cmd === "newgame") {
    const opts = Object.fromEntries(args.slice(1).map((a) => { const [k, v] = a.split("="); return [k, v !== "false"]; }));
    await run(newGameExpression(args[0] ?? "Plains", opts));
  } else if (cmd === "wait") {
    const expr = args[0];
    const deadline = Date.now() + Number(args[1] ?? 60) * 1000;
    let lastError = "";
    for (;;) {
      try {
        const conn = await connect();
        const v = await evaluate(conn, expr);
        conn.close();
        if (v) { console.log(typeof v === "string" ? v : JSON.stringify(v)); break; }
        lastError = "";
      } catch (e) { lastError = e.message; }
      if (Date.now() > deadline) throw new Error(`timed out${lastError ? ` (last error: ${lastError})` : ""}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  } else {
    const lines = readFileSync(new URL(import.meta.url), "utf8").split("\n");
    console.log(lines.slice(0, lines.findIndex((l) => !l.startsWith("//"))).join("\n"));
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
