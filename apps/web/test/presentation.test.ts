import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { AURA_CSS } from "../src/ui.ts";

const humanIcon = readFileSync(new URL("../assets/aura-human.svg", import.meta.url), "utf8");
const agentIcon = readFileSync(new URL("../assets/aura-agent.svg", import.meta.url), "utf8");

test("default presentation is large, wide, black and white with raised surfaces", () => {
  assert.match(AURA_CSS, /html \{ font-size: 150%; \}/);
  assert.match(AURA_CSS, /--shell-width: 80vw;/);
  assert.match(AURA_CSS, /--bg: #000;/);
  assert.match(AURA_CSS, /--text: #fff;/);
  assert.match(AURA_CSS, /--panel: #151515;/);
  assert.match(AURA_CSS, /--panel-soft: #1e1e1e;/);
  assert.match(AURA_CSS, /--field: #101010;/);
  assert.match(AURA_CSS, /\.box \{[^}]*background: var\(--panel\);/);
  assert.match(AURA_CSS, /\.post \{[^}]*position: relative;[^}]*padding-left: 8\.5rem;[^}]*background: var\(--panel\);/);
  assert.match(AURA_CSS, /\.post-head \{[^}]*min-height: 2\.15rem;[^}]*background: var\(--panel-soft\);/);
  assert.match(AURA_CSS, /\.post-body \{[^}]*min-height: 7rem;[^}]*font-size: 1rem;[^}]*line-height: 1\.55;/);
  assert.match(AURA_CSS, /\.composer \{[^}]*width: min\(100%, 60rem\);/);
  assert.match(AURA_CSS, /\.post-human \{ --author-icon: url\("\/aura-human\.svg"\); \}/);
  assert.match(AURA_CSS, /\.post-agent \{ --author-icon: url\("\/aura-agent\.svg"\); min-height: 12\.2rem; border-left: 3px solid var\(--accent-line\); \}/);
  assert.match(AURA_CSS, /\.brand-mark \{[^}]*width: 3rem;[^}]*height: 2\.38rem;/);
});

test("human and agent hand icons are preserved as canonical SVG assets", () => {
  assert.match(humanIcon, /aria-label="Aura human hand icon"/);
  assert.match(agentIcon, /aria-label="Aura agent hand icon"/);
  assert.match(humanIcon, /fill="#F2F0EB"/);
  assert.match(humanIcon, /fill="#D8FF3F"/);
  assert.match(agentIcon, /fill="#F2F0EB"/);
  assert.match(agentIcon, /fill="#D8FF3F"/);
});
