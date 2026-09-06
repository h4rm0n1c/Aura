export interface MarkdownRenderOptions {
  readonly postIdBySequence?: ReadonlyMap<number, string>;
}

export function renderMarkdown(source: string, options: MarkdownRenderOptions = {}): string {
  const lines = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const out: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*```([A-Za-z0-9_+-]{0,32})\s*$/);
    if (fence !== null) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const language = fence[1] ? ` class="language-${escapeAttr(fence[1])}"` : "";
      out.push(`<pre><code${language}>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*$/);
    if (heading !== null) {
      const level = Math.min(6, heading[1].length + 2);
      out.push(`<h${level}>${renderInline(heading[2], options)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})\s*$/.test(line)) {
      out.push("<hr>");
      index += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length) {
        const match = lines[index].match(/^\s*>\s?(.*)$/);
        if (match === null) break;
        quoted.push(match[1]);
        index += 1;
      }
      out.push(`<blockquote>${renderMarkdown(quoted.join("\n"), options)}</blockquote>`);
      continue;
    }

    const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
    if (unordered !== null) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].match(/^\s*[-+*]\s+(.+)$/);
        if (match === null) break;
        items.push(`<li>${renderInline(match[1], options)}</li>`);
        index += 1;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ordered !== null) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].match(/^\s*\d+\.\s+(.+)$/);
        if (match === null) break;
        items.push(`<li>${renderInline(match[1], options)}</li>`);
        index += 1;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() !== "" && !startsBlock(lines[index], paragraph.length > 0)) {
      paragraph.push(lines[index]);
      index += 1;
    }
    if (paragraph.length === 0) {
      paragraph.push(line);
      index += 1;
    }
    out.push(`<p>${paragraph.map((part) => renderInline(part, options)).join("<br>")}</p>`);
  }

  return out.join("\n");
}

function startsBlock(line: string, insideParagraph: boolean): boolean {
  if (!insideParagraph) return false;
  return /^\s*```/.test(line) ||
    /^\s*#{1,6}\s+/.test(line) ||
    /^\s*>/.test(line) ||
    /^\s*[-+*]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    /^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})\s*$/.test(line);
}

function renderInline(source: string, options: MarkdownRenderOptions): string {
  let out = "";
  let index = 0;

  while (index < source.length) {
    if (source[index] === "\\" && index + 1 < source.length && "\\`*_[]()~>#".includes(source[index + 1])) {
      out += escapeHtml(source[index + 1]);
      index += 2;
      continue;
    }

    if (source[index] === "`") {
      const end = source.indexOf("`", index + 1);
      if (end !== -1) {
        out += `<code>${escapeHtml(source.slice(index + 1, end))}</code>`;
        index = end + 1;
        continue;
      }
    }

    if (source.startsWith("**", index)) {
      const end = source.indexOf("**", index + 2);
      if (end !== -1) {
        out += `<strong>${renderInline(source.slice(index + 2, end), options)}</strong>`;
        index = end + 2;
        continue;
      }
    }

    if (source.startsWith("~~", index)) {
      const end = source.indexOf("~~", index + 2);
      if (end !== -1) {
        out += `<del>${renderInline(source.slice(index + 2, end), options)}</del>`;
        index = end + 2;
        continue;
      }
    }

    if (source[index] === "*") {
      const end = source.indexOf("*", index + 1);
      if (end !== -1) {
        out += `<em>${renderInline(source.slice(index + 1, end), options)}</em>`;
        index = end + 1;
        continue;
      }
    }

    if (source[index] === "[") {
      const labelEnd = source.indexOf("]", index + 1);
      if (labelEnd !== -1 && source[labelEnd + 1] === "(") {
        const urlEnd = source.indexOf(")", labelEnd + 2);
        if (urlEnd !== -1) {
          const label = source.slice(index + 1, labelEnd);
          const href = safeHref(source.slice(labelEnd + 2, urlEnd).trim());
          if (href !== null) {
            out += `<a href="${escapeAttr(href)}" rel="nofollow noreferrer noopener">${renderInline(label, {})}</a>`;
          } else {
            out += escapeHtml(source.slice(index, urlEnd + 1));
          }
          index = urlEnd + 1;
          continue;
        }
      }
    }

    if (source.startsWith(">>", index)) {
      const match = source.slice(index).match(/^>>([1-9][0-9]{0,8})/);
      if (match !== null) {
        const sequence = Number(match[1]);
        const postId = options.postIdBySequence?.get(sequence);
        out += postId === undefined
          ? escapeHtml(match[0])
          : `<a class="post-ref" href="#p-${escapeAttr(postId)}">&gt;&gt;${sequence}</a>`;
        index += match[0].length;
        continue;
      }
    }

    out += escapeHtml(source[index]);
    index += 1;
  }

  return out;
}

function safeHref(value: string): string | null {
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
