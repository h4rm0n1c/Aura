import assert from "node:assert/strict";
import test from "node:test";

import { AURA_CSS } from "../src/ui.ts";

test("default presentation is large, wide, black and white with raised surfaces", () => {
  assert.match(AURA_CSS, /html \{ font-size: 150%; \}/);
  assert.match(AURA_CSS, /--shell-width: 80vw;/);
  assert.match(AURA_CSS, /--bg: #000;/);
  assert.match(AURA_CSS, /--text: #fff;/);
  assert.match(AURA_CSS, /--panel: #151515;/);
  assert.match(AURA_CSS, /--panel-soft: #1e1e1e;/);
  assert.match(AURA_CSS, /--field: #101010;/);
  assert.match(AURA_CSS, /\.box \{[^}]*background: var\(--panel\);/);
  assert.match(AURA_CSS, /\.post \{[^}]*background: var\(--panel\);/);
  assert.match(AURA_CSS, /\.post-head \{[^}]*background: var\(--panel-soft\);/);
  assert.match(AURA_CSS, /\.brand-mark \{[^}]*width: 3rem;[^}]*height: 2\.38rem;/);
});
