// Read and change game and mod options in the running game, through the
// options screen's own bindings (as clicking in Options would).
//
//   node settings.mjs pages                      option page ids
//   node settings.mjs list <page|mod id>         every option on a page: path, type, value
//   node settings.mjs get <path>                 one option's value
//   node settings.mjs set <path> <value>         set it; prints the old value to restore
//
// <path> is the option's full id, e.g. BetterAssetMenu.BetterAssetMenu.Mod.Setting.MenuStyle
// (a suffix after "Setting." is enough when it's unique: `set MenuStyle Radial`).
// <value>: true/false for toggles, a member name or number for enums/dropdowns
// (Radial, Pane, 1), a number for sliders (in the units the slider shows, e.g.
// 100 for 100%), JSON otherwise.
//
// The options system only updates while its screen is open, so each command
// opens Options (main menu or city), selects the option's page and section,
// works, then returns to the screen it found. Values are type-checked first:
// a trigger called with the wrong argument types crashes the game natively.
// Changes persist to the user's settings, so always set the old value back.
import { readFileSync } from "node:fs";

const PORT = process.env.CDP_PORT ?? "9444";
const USERDATA = process.env.CSII_USERDATAPATH;
const [cmd, ...args] = process.argv.slice(2);

async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const ws = new WebSocket(list[0].webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error("websocket error")); });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    try { const x = JSON.parse(m.data); if (x.id && pending.has(x.id)) { pending.get(x.id)(x); pending.delete(x.id); } } catch {}
  };
  const ev = (body) => new Promise((ok, fail) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); fail(new Error("evaluate timed out")); }, 30000);
    pending.set(n, (x) => {
      clearTimeout(timer);
      const r = x.result;
      if (r?.exceptionDetails) fail(new Error(r.exceptionDetails.exception?.description ?? "evaluate failed"));
      else ok(r?.result?.value);
    });
    ws.send(JSON.stringify({ id: n, method: "Runtime.evaluate", params: { expression: `(async () => { ${PRELUDE}\n${body}\n})()`, returnByValue: true, awaitPromise: true } }));
  });
  return { ev, close: () => ws.close() };
}

// In the UI: read a binding once; wait; open/close Options for the current mode.
const PRELUDE = `
const readBinding = (n) => new Promise((ok, fail) => {
  const h = engine.on(n + ".update", (v) => { h.clear(); engine.trigger(n + ".unsubscribe"); ok(v); });
  engine.trigger(n + ".subscribe");
  setTimeout(() => { h.clear(); fail(new Error("no update for binding " + n)); }, 5000);
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
`;

// "MainMenu" or "Game", from the log game.sh reads too.
function gameMode() {
  if (!USERDATA) throw new Error("CSII_USERDATAPATH is not set");
  const log = readFileSync(`${USERDATA}/Logs/SceneFlow.log`, "utf8");
  const modes = [...log.matchAll(/Loading mode (\w+)/g)].map((m) => m[1]);
  const mode = modes.at(-1);
  if (mode !== "MainMenu" && mode !== "Game") throw new Error(`options need the main menu or a city (mode: ${mode ?? "none"})`);
  return mode;
}

// Screen bindings and the Options screen's value per mode (MenuUISystem.MenuScreen,
// GameScreenUISystem.GameScreen).
const SCREENS = { MainMenu: { group: "menu", options: 3 }, Game: { group: "game", options: 14 } };

// Runs `body` with the page holding `optionId` (or page `pageId`) selected and
// `children` = its widgets, then restores the screen.
async function withOptions(c, { optionId, pageId }, body) {
  const { group, options } = SCREENS[gameMode()];
  return c.ev(`
    const pages = await readBinding("options.pages");
    let page, section;
    for (const p of pages) for (const s of p.sections) {
      const hit = ${JSON.stringify(optionId ?? null)}
        ? s.items.some((i) => i.displayName?.id === "Options.OPTION[" + ${JSON.stringify(optionId)} + "]")
        : p.id === ${JSON.stringify(pageId ?? null)};
      if (hit && !page) { page = p; section = s; }
    }
    if (!page) throw new Error("no options page for " + ${JSON.stringify(optionId ?? pageId)});
    const before = await readBinding("${group}.activeScreen");
    engine.trigger("${group}.setActiveScreen", ${options});
    await wait(500);
    const results = [];
    try {
      for (const s of ${pageId ? "page.sections" : "[section]"}) {
        engine.trigger("options.selectPage", page.id, s.id, false);
        await wait(400);
        const children = await readBinding("options.children");
        results.push(await (async (page, section, children) => { ${body} })(page, s, children));
      }
    } finally {
      engine.trigger("${group}.setActiveScreen", before);
    }
    return results;`);
}

// Widget summary: path, type, value, and enum member names.
const SUMMARIZE = `
  const flat = (ws) => ws.flatMap((w) => [w, ...flat(w.children ?? [])]);
  const name = (m) => /\\[([^\\]]*)\\]$/.exec(m.displayName?.id ?? "")?.[1] ?? "";
  const summary = (w) => ({
    path: w.path,
    type: w.props.__Type.replace("Game.UI.Widgets.", ""),
    value: w.props.value,
    ...(w.props.enumMembers && { members: w.props.enumMembers.map((m) => name(m) + "=" + JSON.stringify(m.value)) }),
    ...(w.props.items && { items: w.props.items.map((i) => JSON.stringify(i.value)) }),
    ...(w.props.min !== undefined && { min: w.props.min, max: w.props.max, step: w.props.step, unit: w.props.unit }),
    ...(w.props.disabled && { disabled: true }),
    ...(w.props.hidden && { hidden: true }),
  });`;

// Resolves a short path (MenuStyle) to the full option id via the pages list.
async function resolvePath(c, path) {
  const ids = await c.ev(`
    const pages = await readBinding("options.pages");
    return pages.flatMap((p) => p.sections.flatMap((s) => s.items.map((i) => /^Options\\.OPTION\\[(.*)\\]$/.exec(i.displayName?.id ?? "")?.[1]).filter(Boolean)));`);
  if (ids.includes(path)) return path;
  const hits = ids.filter((id) => id.endsWith("." + path) || id.endsWith("Setting." + path));
  if (hits.length === 1) return hits[0];
  throw new Error(hits.length ? `ambiguous: ${hits.join(", ")}` : `no option ${path}`);
}

async function readOption(c, id) {
  const [w] = await withOptions(c, { optionId: id }, `${SUMMARIZE}
    const w = flat(children).find((w) => w.path === ${JSON.stringify(id)});
    if (!w) throw new Error("option not shown (hidden in this mode?): " + ${JSON.stringify(id)});
    return summary(w);`);
  return w;
}

// Sliders take values in the units they display (e.g. 100 for 100%), within min..max.
function inRange(widget, n) {
  if (widget.min !== undefined && (n < widget.min || n > widget.max))
    throw new Error(`${widget.path} takes ${widget.min}..${widget.max}${widget.unit ? " (" + widget.unit + ")" : ""}`);
  // The slider itself only produces min + k * step; setValue would take anything.
  if (widget.step > 0) {
    const k = (n - widget.min) / widget.step;
    if (Math.abs(k - Math.round(k)) > 1e-4) throw new Error(`${widget.path} moves in steps of ${widget.step} from ${widget.min}`);
  }
  return n;
}

// The value to send for `raw`, checked against the widget's type; throws if unsure.
function encode(widget, raw) {
  const json = (() => { try { return JSON.parse(raw); } catch { return raw; } })();
  switch (widget.type) {
    case "ToggleField":
      if (typeof json !== "boolean") throw new Error(`${widget.path} is a toggle: pass true or false`);
      return json;
    case "EnumField": {
      const named = widget.members.find((m) => m.split("=")[0].toLowerCase() === String(raw).toLowerCase());
      if (named) return JSON.parse(named.slice(named.indexOf("=") + 1));
      if (Number.isInteger(json) && json >= 0) return [json, 0];
      if (Array.isArray(json) && json.length === 2) return json;
      throw new Error(`${widget.path} is an enum: pass one of ${widget.members.join(", ")}`);
    }
    case "IntSliderField": case "IntInputField":
      if (!Number.isInteger(json)) throw new Error(`${widget.path} needs an integer`);
      return inRange(widget, json);
    case "FloatSliderField": case "FloatInputField":
      if (typeof json !== "number") throw new Error(`${widget.path} needs a number`);
      return inRange(widget, json);
    case "DropdownField":
      if (widget.items && !widget.items.includes(JSON.stringify(json)))
        throw new Error(`${widget.path} is a dropdown: pass one of ${widget.items.join(", ")}`);
      return json;
    case "StringInputField":
      if (typeof json !== typeof widget.value) throw new Error(`${widget.path} needs a ${typeof widget.value} like ${JSON.stringify(widget.value)}`);
      return json;
    default:
      throw new Error(`${widget.path} is a ${widget.type}; setting it isn't supported here (unknown value shape)`);
  }
}

const c = await connect();
try {
  if (cmd === "pages") {
    console.log((await c.ev(`return (await readBinding("options.pages")).map((p) => p.id);`)).join("\n"));
  } else if (cmd === "list" && args[0]) {
    const pageId = await c.ev(`
      const ids = (await readBinding("options.pages")).map((p) => p.id);
      return ids.find((id) => id === ${JSON.stringify(args[0])}) ?? ids.find((id) => id.startsWith(${JSON.stringify(args[0] + ".")}));`);
    if (!pageId) throw new Error(`no page ${args[0]} (see: settings.mjs pages)`);
    const sections = await withOptions(c, { pageId }, `${SUMMARIZE}
      return { section: section.id, options: flat(children).filter((w) => typeof w.path === "string").map(summary) };`);
    console.log(JSON.stringify(sections, null, 2));
  } else if (cmd === "get" && args[0]) {
    console.log(JSON.stringify(await readOption(c, await resolvePath(c, args[0])), null, 2));
  } else if (cmd === "set" && args[0] && args.length >= 2) {
    const id = await resolvePath(c, args[0]);
    const widget = await readOption(c, id);
    // Never write options the UI hides or disables: a write to a hidden one
    // (edge scrolling sensitivity while edge scrolling is off) IS saved, but
    // its widget keeps showing the old value, so it can't be checked or
    // restored through here.
    if (widget.disabled || widget.hidden) throw new Error(`${id} is ${widget.hidden ? "hidden" : "disabled"} right now; change what it depends on first`);
    const value = encode(widget, args[1]);
    const [after] = await withOptions(c, { optionId: id }, `${SUMMARIZE}
      engine.trigger("options.setValue", [${JSON.stringify(id)}], ${JSON.stringify(value)});
      await wait(400);
      const fresh = await readBinding("options.children");
      return summary(flat(fresh).find((w) => w.path === ${JSON.stringify(id)}));`);
    if (JSON.stringify(after.value) === JSON.stringify(widget.value) && JSON.stringify(value) !== JSON.stringify(widget.value))
      throw new Error(`${id} didn't change (still ${JSON.stringify(after.value)}); the game ignored the value`);
    console.log(JSON.stringify({ path: id, old: widget.value, new: after.value, restore: `node settings.mjs set ${id} '${JSON.stringify(widget.value)}'` }, null, 2));
  } else {
    const lines = readFileSync(new URL(import.meta.url), "utf8").split("\n");
    console.log(lines.slice(0, lines.findIndex((l) => !l.startsWith("//"))).join("\n"));
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  c.close();
}
