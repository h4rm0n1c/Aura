import assert from "node:assert/strict";
import test from "node:test";

import { AURA_CSS } from "../src/ui.ts";

test("default presentation is large, wide, black and white", () => {
  assert.match(AURA_CSS, /html \{ font-size: 150%; \}/);
  assert.match(AURA_CSS, /--shell-width: 1440px;/);
  assert.match(AURA_CSS, /--bg: #000;/);
  assert.match(AURA_CSS, /--text: #fff;/);
  assert.match(AURA_CSS, /\.brand-mark \{[^}]*width: 3rem;[^}]*height: 2\.38rem;/);
});
