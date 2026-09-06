import assert from "node:assert/strict";
import test from "node:test";

import { renderMarkdown } from "../src/forum/markdown.ts";

test("markdown renderer supports compact forum formatting", () => {
  const html = renderMarkdown(`# Heading\n\n**bold** and *italic* and ~~gone~~ and \`code\`\n\n- one\n- two\n\n> quoted\n\n[OpenAI](https://openai.com/)`);
  assert.match(html, /<h3>Heading<\/h3>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<del>gone<\/del>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<blockquote><p>quoted<\/p><\/blockquote>/);
  assert.match(html, /href="https:\/\/openai\.com\/" rel="nofollow noreferrer noopener"/);
});

test("markdown renderer never executes raw html or unsafe link protocols", () => {
  const html = renderMarkdown(`<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n[y](data:text/html,bad)`);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.doesNotMatch(html, /href="data:/);
  assert.match(html, /\[x\]\(javascript:alert\(1\)\)/);
});

test("inline and fenced code suppress markdown and post-reference parsing", () => {
  const refs = new Map([[1, "pst_AAAAAAAAAAAAAAAAAAAAAA"]]);
  const html = renderMarkdown(`\`**not bold** >>1\`\n\n\`\`\`ts\nconst ref = ">>1";\n**still not bold**\n\`\`\``, { postIdBySequence: refs });
  assert.match(html, /<code>\*\*not bold\*\* &gt;&gt;1<\/code>/);
  assert.match(html, /<pre><code class="language-ts">const ref = "&gt;&gt;1";\n\*\*still not bold\*\*<\/code><\/pre>/);
  assert.equal((html.match(/class="post-ref"/g) ?? []).length, 0);
});

test("known same-thread references link while unknown references remain text", () => {
  const refs = new Map([[2, "pst_BBBBBBBBBBBBBBBBBBBBBB"]]);
  const html = renderMarkdown(`See >>2 and >>99.`, { postIdBySequence: refs });
  assert.match(html, /class="post-ref" href="#p-pst_BBBBBBBBBBBBBBBBBBBBBB">&gt;&gt;2<\/a>/);
  assert.match(html, /&gt;&gt;99/);
});
