export const AURA_CLIENT_JS = String.raw`(() => {
  "use strict";

  const TICK = String.fromCharCode(96);
  const FENCE = TICK.repeat(3);
  const encoder = new TextEncoder();

  function postSequence(link) {
    const explicit = link.dataset.postSequence;
    if (explicit && /^[1-9][0-9]{0,8}$/.test(explicit)) return explicit;

    const article = link.closest("article.post");
    const number = article?.querySelector(".post-number")?.textContent?.trim() ?? "";
    const match = /^No\.([1-9][0-9]{0,8})$/.exec(number);
    return match?.[1] ?? null;
  }

  function replyReference(link) {
    const sequence = postSequence(link);
    if (sequence === null) return;

    const textarea = document.getElementById("reply-body");
    if (!(textarea instanceof HTMLTextAreaElement)) return;

    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const before = textarea.value.slice(0, start);
    const needsLeadingNewline = before.length > 0 && !before.endsWith("\n");
    const insertion = (needsLeadingNewline ? "\n" : "") + ">>" + sequence + "\n";

    textarea.setRangeText(insertion, start, end, "end");
    textarea.focus({ preventScroll: true });
    textarea.scrollIntoView({ block: "center", behavior: "auto" });
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function safeHref(value) {
    if (value.startsWith("/") && !value.startsWith("//")) return value;
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
    } catch {
      return null;
    }
  }

  function appendText(parent, value) {
    parent.appendChild(document.createTextNode(value));
  }

  function appendInline(parent, source, refs) {
    let index = 0;
    const escapable = "\\*_[]()~>#" + TICK;

    while (index < source.length) {
      if (source[index] === "\\" && index + 1 < source.length && escapable.includes(source[index + 1])) {
        appendText(parent, source[index + 1]);
        index += 2;
        continue;
      }

      if (source[index] === TICK) {
        const end = source.indexOf(TICK, index + 1);
        if (end !== -1) {
          const code = document.createElement("code");
          code.textContent = source.slice(index + 1, end);
          parent.appendChild(code);
          index = end + 1;
          continue;
        }
      }

      if (source.startsWith("**", index)) {
        const end = source.indexOf("**", index + 2);
        if (end !== -1) {
          const strong = document.createElement("strong");
          appendInline(strong, source.slice(index + 2, end), refs);
          parent.appendChild(strong);
          index = end + 2;
          continue;
        }
      }

      if (source.startsWith("~~", index)) {
        const end = source.indexOf("~~", index + 2);
        if (end !== -1) {
          const del = document.createElement("del");
          appendInline(del, source.slice(index + 2, end), refs);
          parent.appendChild(del);
          index = end + 2;
          continue;
        }
      }

      if (source[index] === "*") {
        const end = source.indexOf("*", index + 1);
        if (end !== -1) {
          const em = document.createElement("em");
          appendInline(em, source.slice(index + 1, end), refs);
          parent.appendChild(em);
          index = end + 1;
          continue;
        }
      }

      if (source[index] === "[") {
        const labelEnd = source.indexOf("]", index + 1);
        if (labelEnd !== -1 && source[labelEnd + 1] === "(") {
          const urlEnd = source.indexOf(")", labelEnd + 2);
          if (urlEnd !== -1) {
            const href = safeHref(source.slice(labelEnd + 2, urlEnd).trim());
            if (href !== null) {
              const anchor = document.createElement("a");
              anchor.href = href;
              anchor.rel = "nofollow noreferrer noopener";
              appendInline(anchor, source.slice(index + 1, labelEnd), new Map());
              parent.appendChild(anchor);
            } else {
              appendText(parent, source.slice(index, urlEnd + 1));
            }
            index = urlEnd + 1;
            continue;
          }
        }
      }

      if (source.startsWith(">>", index)) {
        const match = /^>>([1-9][0-9]{0,8})/.exec(source.slice(index));
        if (match !== null) {
          const sequence = Number(match[1]);
          const href = refs.get(sequence);
          if (href === undefined) {
            appendText(parent, match[0]);
          } else {
            const anchor = document.createElement("a");
            anchor.className = "post-ref";
            anchor.href = href;
            anchor.textContent = ">>" + sequence;
            parent.appendChild(anchor);
          }
          index += match[0].length;
          continue;
        }
      }

      appendText(parent, source[index]);
      index += 1;
    }
  }

  function isFenceLine(line) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(FENCE)) return null;
    const suffix = trimmed.slice(FENCE.length);
    if (!/^[A-Za-z0-9_+-]{0,32}$/.test(suffix)) return null;
    return suffix;
  }

  function isHorizontalRule(line) {
    return /^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})\s*$/.test(line);
  }

  function startsBlock(line, insideParagraph) {
    if (!insideParagraph) return false;
    return isFenceLine(line) !== null ||
      /^\s*#{1,6}\s+/.test(line) ||
      /^\s*>(?!>)/.test(line) ||
      /^\s*[-+*]\s+/.test(line) ||
      /^\s*\d+\.\s+/.test(line) ||
      isHorizontalRule(line);
  }

  function renderMarkdownInto(container, source, refs) {
    container.replaceChildren();
    const lines = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];
      if (line.trim() === "") {
        index += 1;
        continue;
      }

      const fenceLanguage = isFenceLine(line);
      if (fenceLanguage !== null) {
        const body = [];
        index += 1;
        while (index < lines.length && lines[index].trim() !== FENCE) {
          body.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        if (fenceLanguage) code.className = "language-" + fenceLanguage;
        code.textContent = body.join("\n");
        pre.appendChild(code);
        container.appendChild(pre);
        continue;
      }

      const heading = /^\s*(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (heading !== null) {
        const level = Math.min(6, heading[1].length + 2);
        const node = document.createElement("h" + level);
        appendInline(node, heading[2], refs);
        container.appendChild(node);
        index += 1;
        continue;
      }

      if (isHorizontalRule(line)) {
        container.appendChild(document.createElement("hr"));
        index += 1;
        continue;
      }

      if (/^\s*>(?!>)/.test(line)) {
        const quoted = [];
        while (index < lines.length) {
          const match = /^\s*>(?!>)\s?(.*)$/.exec(lines[index]);
          if (match === null) break;
          quoted.push(match[1]);
          index += 1;
        }
        const blockquote = document.createElement("blockquote");
        renderMarkdownInto(blockquote, quoted.join("\n"), refs);
        container.appendChild(blockquote);
        continue;
      }

      const unordered = /^\s*[-+*]\s+(.+)$/.exec(line);
      if (unordered !== null) {
        const list = document.createElement("ul");
        while (index < lines.length) {
          const match = /^\s*[-+*]\s+(.+)$/.exec(lines[index]);
          if (match === null) break;
          const item = document.createElement("li");
          appendInline(item, match[1], refs);
          list.appendChild(item);
          index += 1;
        }
        container.appendChild(list);
        continue;
      }

      const ordered = /^\s*\d+\.\s+(.+)$/.exec(line);
      if (ordered !== null) {
        const list = document.createElement("ol");
        while (index < lines.length) {
          const match = /^\s*\d+\.\s+(.+)$/.exec(lines[index]);
          if (match === null) break;
          const item = document.createElement("li");
          appendInline(item, match[1], refs);
          list.appendChild(item);
          index += 1;
        }
        container.appendChild(list);
        continue;
      }

      const paragraph = [];
      while (index < lines.length && lines[index].trim() !== "" && !startsBlock(lines[index], paragraph.length > 0)) {
        paragraph.push(lines[index]);
        index += 1;
      }
      if (paragraph.length === 0) {
        paragraph.push(line);
        index += 1;
      }
      const p = document.createElement("p");
      for (let part = 0; part < paragraph.length; part += 1) {
        if (part > 0) p.appendChild(document.createElement("br"));
        appendInline(p, paragraph[part], refs);
      }
      container.appendChild(p);
    }
  }

  function collectPostTargets() {
    const refs = new Map();
    for (const link of document.querySelectorAll("a.post-number")) {
      if (!(link instanceof HTMLAnchorElement)) continue;
      const match = /^No\.([1-9][0-9]{0,8})$/.exec(link.textContent?.trim() ?? "");
      if (match !== null && link.hash.startsWith("#p-")) refs.set(Number(match[1]), link.hash);
    }
    return refs;
  }

  function dispatchInput(textarea) {
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function wrapSelection(textarea, before, after, placeholder) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const selected = textarea.value.slice(start, end);
    const content = selected || placeholder;
    textarea.setRangeText(before + content + after, start, end, "end");
    textarea.setSelectionRange(start + before.length, start + before.length + content.length);
    textarea.focus();
    dispatchInput(textarea);
  }

  function prefixSelection(textarea, prefix) {
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? start;
    const lineStart = textarea.value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const nextBreak = textarea.value.indexOf("\n", end);
    const lineEnd = nextBreak === -1 ? textarea.value.length : nextBreak;
    const selected = textarea.value.slice(lineStart, lineEnd);
    const replacement = selected.split("\n").map((line) => prefix + line).join("\n");
    textarea.setRangeText(replacement, lineStart, lineEnd, "end");
    textarea.setSelectionRange(lineStart, lineStart + replacement.length);
    textarea.focus();
    dispatchInput(textarea);
  }

  function insertCode(textarea) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const selected = textarea.value.slice(start, end);
    if (selected.includes("\n")) {
      wrapSelection(textarea, FENCE + "\n", "\n" + FENCE, selected || "code");
    } else {
      wrapSelection(textarea, TICK, TICK, "code");
    }
  }

  function insertLink(textarea) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const selected = textarea.value.slice(start, end) || "link text";
    const replacement = "[" + selected + "](https://)";
    textarea.setRangeText(replacement, start, end, "end");
    const urlStart = start + selected.length + 3;
    textarea.setSelectionRange(urlStart, urlStart + 8);
    textarea.focus();
    dispatchInput(textarea);
  }

  function toolbarButton(label, title, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.addEventListener("click", handler);
    return button;
  }

  function enhanceMarkdownEditor(form) {
    const textarea = form.querySelector('textarea[name="body"]');
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    const field = textarea.closest("p");
    if (!(field instanceof HTMLElement)) return;

    const toolbar = document.createElement("div");
    toolbar.className = "markdown-editor-toolbar";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Markdown formatting");

    toolbar.appendChild(toolbarButton("B", "Bold (Ctrl+B)", () => wrapSelection(textarea, "**", "**", "bold text")));
    toolbar.appendChild(toolbarButton("I", "Italic (Ctrl+I)", () => wrapSelection(textarea, "*", "*", "italic text")));
    toolbar.appendChild(toolbarButton("S", "Strikethrough", () => wrapSelection(textarea, "~~", "~~", "struck text")));
    toolbar.appendChild(toolbarButton("Code", "Inline or fenced code", () => insertCode(textarea)));
    toolbar.appendChild(toolbarButton(">", "Quote selected line(s)", () => prefixSelection(textarea, "> ")));
    toolbar.appendChild(toolbarButton("List", "Bulleted list", () => prefixSelection(textarea, "- ")));
    toolbar.appendChild(toolbarButton("Link", "Link (Ctrl+K)", () => insertLink(textarea)));

    const area = document.createElement("div");
    area.className = "markdown-editor-area";
    field.before(toolbar);
    field.before(area);
    area.appendChild(field);

    let preview = form.querySelector(".markdown-preview");
    const hadServerPreview = preview instanceof HTMLElement;
    if (!(preview instanceof HTMLElement)) {
      preview = document.createElement("section");
      preview.className = "markdown-preview markdown-editor-preview";
      preview.setAttribute("aria-label", "Markdown preview");
      const label = document.createElement("div");
      label.className = "preview-label";
      label.textContent = "Preview · local";
      const body = document.createElement("div");
      body.className = "markdown-body";
      preview.append(label, body);
    } else {
      preview.classList.add("markdown-editor-preview");
      const label = preview.querySelector(".preview-label");
      if (label) label.textContent = "Preview · local";
    }
    area.appendChild(preview);

    const previewBody = preview.querySelector(".markdown-body");
    const previewButton = form.querySelector('button[name="intent"][value="preview"]');
    let previewOpen = hadServerPreview;

    function renderPreview() {
      if (!(previewBody instanceof HTMLElement)) return;
      renderMarkdownInto(previewBody, textarea.value, collectPostTargets());
      if (!textarea.value.trim()) {
        const empty = document.createElement("p");
        empty.className = "meta";
        empty.textContent = "Nothing to preview.";
        previewBody.appendChild(empty);
      }
    }

    function setPreviewOpen(open) {
      previewOpen = open;
      preview.hidden = !open;
      area.classList.toggle("preview-open", open);
      if (previewButton instanceof HTMLButtonElement) previewButton.setAttribute("aria-pressed", String(open));
      if (open) renderPreview();
    }

    if (previewButton instanceof HTMLButtonElement) {
      previewButton.type = "button";
      previewButton.classList.add("editor-preview-toggle");
      previewButton.title = "Toggle local preview; no request is sent";
      previewButton.setAttribute("aria-pressed", String(previewOpen));
      previewButton.addEventListener("click", () => setPreviewOpen(!previewOpen));
      toolbar.appendChild(previewButton);
    }

    const status = document.createElement("span");
    status.className = "markdown-editor-status";
    status.id = (textarea.id || "markdown-body") + "-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    toolbar.appendChild(status);
    textarea.setAttribute("aria-describedby", status.id);

    const maxBytes = Number(textarea.dataset.maxBytes || "12288");
    function updateStatus() {
      const bytes = encoder.encode(textarea.value).byteLength;
      const tooLarge = Number.isFinite(maxBytes) && maxBytes > 0 && bytes > maxBytes;
      status.textContent = bytes.toLocaleString() + " / " + maxBytes.toLocaleString() + " bytes";
      status.classList.toggle("invalid", tooLarge);
      textarea.setCustomValidity(tooLarge ? "Post exceeds the UTF-8 byte limit." : "");
      if (previewOpen) renderPreview();
    }

    textarea.addEventListener("input", updateStatus);
    textarea.addEventListener("keydown", (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "b") {
        event.preventDefault();
        wrapSelection(textarea, "**", "**", "bold text");
      } else if (key === "i") {
        event.preventDefault();
        wrapSelection(textarea, "*", "*", "italic text");
      } else if (key === "k") {
        event.preventDefault();
        insertLink(textarea);
      }
    });

    setPreviewOpen(previewOpen);
    updateStatus();
  }

  for (const form of document.querySelectorAll(".composer form")) {
    if (form instanceof HTMLFormElement) enhanceMarkdownEditor(form);
  }

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest("a.post-reply");
    if (!(link instanceof HTMLAnchorElement)) return;

    event.preventDefault();
    replyReference(link);
  });
})();
`;

export function clientScriptResponse(): Response {
  return new Response(AURA_CLIENT_JS, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
