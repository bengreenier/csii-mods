# UI tests

Run from `RadialMenu/UI`:

- `npm test`: unit and behaviour tests (Vitest). No game needed.
- `npm run typecheck:test`: type-checks the tests with the source they import.
  The mod's own build (`tsconfig.json`) leaves `test/` out.

Layout:

- `query/`, `*.test.ts` at the top: pure logic (search language, wheel layout,
  helpers).
- `menu/`: behaviour tests. They render the real menu in jsdom against fake
  `cs2/*` modules (`fakes/`) and a small invented city (`fixtures/`), and only
  touch its public surface: bindings in, triggers out, the DOM and keys. A
  refactor that has to edit one of these has changed behaviour.

What these can't see (Gameface itself, measured layout, visuals) stays in the
in-game checklist.
