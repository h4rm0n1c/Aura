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

  function dispatchInput(textarea) {
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
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
    dispatchInput(textarea);
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

      if (/^\s*[-+*]\s+(.+)$/.test(line)) {
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

      if (/^\s*\d+\.\s+(.+)$/.test(line)) {
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

  function extractReferenceSequences(source) {
    const references = new Set();
    const lines = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
    let inFence = false;

    for (const line of lines) {
      if (inFence) {
        if (line.trim() === FENCE) inFence = false;
        continue;
      }
      if (isFenceLine(line) !== null) {
        inFence = true;
        continue;
      }
      scanInlineReferences(line, references);
    }

    return [...references].sort((a, b) => a - b);
  }

  function scanInlineReferences(source, references) {
    let index = 0;
    while (index < source.length) {
      if (source[index] === "\\" && index + 1 < source.length) {
        index += 2;
        continue;
      }

      if (source[index] === TICK) {
        const end = source.indexOf(TICK, index + 1);
        if (end !== -1) {
          index = end + 1;
          continue;
        }
      }

      if (source[index] === "[") {
        const labelEnd = source.indexOf("]", index + 1);
        if (labelEnd !== -1 && source[labelEnd + 1] === "(") {
          const urlEnd = source.indexOf(")", labelEnd + 2);
          if (urlEnd !== -1) {
            index = urlEnd + 1;
            continue;
          }
        }
      }

      if (source.startsWith(">>", index)) {
        const match = /^>>([1-9][0-9]{0,8})/.exec(source.slice(index));
        if (match !== null) {
          references.add(Number(match[1]));
          index += match[0].length;
          continue;
        }
      }

      index += 1;
    }
  }

  function setSelection(textarea, start, end) {
    textarea.setSelectionRange(start, end);
    textarea.focus();
    dispatchInput(textarea);
  }

  function toggleWrapSelection(textarea, before, after, placeholder) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const selected = textarea.value.slice(start, end);

    if (selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length) {
      const content = selected.slice(before.length, selected.length - after.length);
      textarea.setRangeText(content, start, end, "end");
      setSelection(textarea, start, start + content.length);
      return;
    }

    const wrappedBefore = textarea.value.slice(Math.max(0, start - before.length), start) === before;
    const wrappedAfter = textarea.value.slice(end, end + after.length) === after;
    if (wrappedBefore && wrappedAfter) {
      textarea.setRangeText(selected, start - before.length, end + after.length, "end");
      setSelection(textarea, start - before.length, end - before.length);
      return;
    }

    const content = selected || placeholder;
    textarea.setRangeText(before + content + after, start, end, "end");
    textarea.setSelectionRange(start + before.length, start + before.length + content.length);
    textarea.focus();
    dispatchInput(textarea);
  }

  function selectedLineRange(textarea) {
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? start;
    const lineStart = textarea.value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const nextBreak = textarea.value.indexOf("\n", end);
    const lineEnd = nextBreak === -1 ? textarea.value.length : nextBreak;
    return { lineStart, lineEnd };
  }

  function transformSelectedLines(textarea, isActive, addPrefix, removePrefix) {
    const range = selectedLineRange(textarea);
    const selected = textarea.value.slice(range.lineStart, range.lineEnd);
    const lines = selected.split("\n");
    const meaningful = lines.filter((line) => line.trim().length > 0);
    const remove = meaningful.length > 0 && meaningful.every(isActive);
    let addIndex = 0;
    const replacement = meaningful.length === 0 && lines.length === 1
      ? addPrefix("", 0)
      : lines.map((line) => {
          if (line.trim().length === 0) return line;
          return remove ? removePrefix(line) : addPrefix(line, addIndex++);
        }).join("\n");

    textarea.setRangeText(replacement, range.lineStart, range.lineEnd, "end");
    textarea.setSelectionRange(range.lineStart, range.lineStart + replacement.length);
    textarea.focus();
    dispatchInput(textarea);
  }

  function toggleQuote(textarea) {
    transformSelectedLines(
      textarea,
      (line) => /^\s*>\s?/.test(line) && !/^\s*>>/.test(line),
      (line) => "> " + line,
      (line) => line.replace(/^(\s*)>\s?/, "$1"),
    );
  }

  function toggleBulletList(textarea) {
    transformSelectedLines(
      textarea,
      (line) => /^\s*[-+*]\s+/.test(line),
      (line) => "- " + line,
      (line) => line.replace(/^(\s*)[-+*]\s+/, "$1"),
    );
  }

  function toggleOrderedList(textarea) {
    transformSelectedLines(
      textarea,
      (line) => /^\s*\d+\.\s+/.test(line),
      (line, index) => String(index + 1) + ". " + line,
      (line) => line.replace(/^(\s*)\d+\.\s+/, "$1"),
    );
  }

  function toggleHeading(textarea) {
    transformSelectedLines(
      textarea,
      (line) => /^\s*#{1,6}\s+/.test(line),
      (line) => "# " + line,
      (line) => line.replace(/^(\s*)#{1,6}\s+/, "$1"),
    );
  }

  function insertCode(textarea) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const selected = textarea.value.slice(start, end);
    if (selected.includes("\n")) {
      toggleWrapSelection(textarea, FENCE + "\n", "\n" + FENCE, "code");
    } else {
      toggleWrapSelection(textarea, TICK, TICK, "code");
    }
  }

  function insertLink(textarea) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const selected = textarea.value.slice(start, end);
    const selectedHref = selected ? safeHref(selected.trim()) : null;

    if (selectedHref !== null) {
      const replacement = "[link text](" + selectedHref + ")";
      textarea.setRangeText(replacement, start, end, "end");
      setSelection(textarea, start + 1, start + 10);
      return;
    }

    const label = selected || "link text";
    const replacement = "[" + label + "](https://)";
    textarea.setRangeText(replacement, start, end, "end");
    const urlStart = start + label.length + 3;
    textarea.setSelectionRange(urlStart, urlStart + 8);
    textarea.focus();
    dispatchInput(textarea);
  }

  function insertHorizontalRule(textarea) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    const prefix = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
    const suffix = after.length > 0 && !after.startsWith("\n") ? "\n" : "";
    const insertion = prefix + "---" + suffix;
    textarea.setRangeText(insertion, start, end, "end");
    setSelection(textarea, start + insertion.length, start + insertion.length);
  }

  function toolbarButton(label, title, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "markdown-editor-tool";
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.addEventListener("click", handler);
    return button;
  }

  function toolbarSeparator() {
    const separator = document.createElement("span");
    separator.className = "markdown-editor-separator";
    separator.setAttribute("role", "separator");
    return separator;
  }

  function enhanceMarkdownEditor(form) {
    const textarea = form.querySelector('textarea[name="body"]');
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    const field = textarea.closest("p");
    if (!(field instanceof HTMLElement)) return;

    const previewButton = form.querySelector('button[name="intent"][value="preview"]');
    if (!(previewButton instanceof HTMLButtonElement)) return;

    let preview = form.querySelector(".markdown-preview");
    const hadServerPreview = preview instanceof HTMLElement;
    if (!(preview instanceof HTMLElement)) {
      preview = document.createElement("section");
      preview.className = "markdown-preview";
      preview.setAttribute("aria-label", "Markdown preview");
      const label = document.createElement("div");
      label.className = "preview-label";
      label.textContent = "Preview";
      const body = document.createElement("div");
      body.className = "markdown-body";
      preview.append(label, body);
    }
    preview.classList.add("markdown-editor-preview");

    const shell = document.createElement("div");
    shell.className = "markdown-editor";
    field.before(shell);

    const header = document.createElement("div");
    header.className = "markdown-editor-header";
    const tabs = document.createElement("div");
    tabs.className = "markdown-editor-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Post editor view");

    const writeButton = document.createElement("button");
    writeButton.type = "button";
    writeButton.className = "markdown-editor-tab";
    writeButton.textContent = "Write";
    writeButton.setAttribute("role", "tab");

    previewButton.type = "button";
    previewButton.className = "markdown-editor-tab";
    previewButton.textContent = "Preview";
    previewButton.title = "Preview locally; no request is sent";
    previewButton.setAttribute("role", "tab");

    tabs.append(writeButton, previewButton);
    header.appendChild(tabs);

    const headerHint = document.createElement("span");
    headerHint.className = "markdown-editor-header-hint";
    headerHint.textContent = "Markdown";
    header.appendChild(headerHint);

    const toolbar = document.createElement("div");
    toolbar.className = "markdown-editor-toolbar";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Markdown formatting");
    toolbar.append(
      toolbarButton("H", "Heading", () => toggleHeading(textarea)),
      toolbarButton("B", "Bold (Ctrl+B)", () => toggleWrapSelection(textarea, "**", "**", "bold text")),
      toolbarButton("I", "Italic (Ctrl+I)", () => toggleWrapSelection(textarea, "*", "*", "italic text")),
      toolbarButton("S", "Strikethrough", () => toggleWrapSelection(textarea, "~~", "~~", "struck text")),
      toolbarSeparator(),
      toolbarButton("Link", "Link (Ctrl+K)", () => insertLink(textarea)),
      toolbarButton("Code", "Inline or fenced code", () => insertCode(textarea)),
      toolbarButton("Quote", "Quote selected line(s)", () => toggleQuote(textarea)),
      toolbarSeparator(),
      toolbarButton("• List", "Bulleted list", () => toggleBulletList(textarea)),
      toolbarButton("1. List", "Numbered list", () => toggleOrderedList(textarea)),
      toolbarButton("—", "Horizontal rule", () => insertHorizontalRule(textarea)),
    );

    const help = form.querySelector(".markdown-help");
    if (help instanceof HTMLDetailsElement) {
      toolbar.append(
        toolbarSeparator(),
        toolbarButton("?", "Formatting help", () => {
          help.open = !help.open;
          if (help.open) help.scrollIntoView({ block: "nearest", behavior: "auto" });
        }),
      );
    }

    const writePane = document.createElement("div");
    writePane.className = "markdown-editor-write";
    writePane.setAttribute("role", "tabpanel");
    writePane.appendChild(field);

    const label = preview.querySelector(".preview-label");
    if (label instanceof HTMLElement) label.hidden = true;
    preview.setAttribute("role", "tabpanel");

    const footer = document.createElement("div");
    footer.className = "markdown-editor-footer";
    const footerHelp = document.createElement("span");
    footerHelp.className = "markdown-editor-footer-help";
    footerHelp.textContent = "Markdown · raw HTML stays text";
    const status = document.createElement("span");
    status.className = "markdown-editor-status";
    status.id = (textarea.id || "markdown-body") + "-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    footer.append(footerHelp, status);

    shell.append(header, toolbar, writePane, preview, footer);

    const previewBody = preview.querySelector(".markdown-body");
    const maxBytes = Number(textarea.dataset.maxBytes || "12288");
    const maxReferences = Number(textarea.dataset.maxReferences || "128");
    const describedBy = textarea.getAttribute("aria-describedby");
    textarea.setAttribute("aria-describedby", describedBy ? describedBy + " " + status.id : status.id);

    let mode = hadServerPreview ? "preview" : "write";
    let previewFrame = 0;

    function renderPreview() {
      previewFrame = 0;
      if (!(previewBody instanceof HTMLElement)) return;
      const previewBytes = encoder.encode(textarea.value).byteLength;
      if (Number.isFinite(maxBytes) && maxBytes > 0 && previewBytes > maxBytes) {
        previewBody.replaceChildren();
        const skipped = document.createElement("p");
        skipped.className = "meta";
        skipped.textContent = "Preview disabled while this draft exceeds the post byte limit.";
        previewBody.appendChild(skipped);
        return;
      }
      renderMarkdownInto(previewBody, textarea.value, collectPostTargets());
      if (!textarea.value.trim()) {
        const empty = document.createElement("p");
        empty.className = "meta";
        empty.textContent = "Nothing to preview.";
        previewBody.appendChild(empty);
      }
    }

    function schedulePreview() {
      if (mode !== "preview" || previewFrame !== 0) return;
      previewFrame = requestAnimationFrame(renderPreview);
    }

    function setMode(nextMode, focusEditor) {
      mode = nextMode;
      const previewOpen = mode === "preview";
      writePane.hidden = previewOpen;
      toolbar.hidden = previewOpen;
      preview.hidden = !previewOpen;
      writeButton.setAttribute("aria-selected", String(!previewOpen));
      previewButton.setAttribute("aria-selected", String(previewOpen));
      writeButton.tabIndex = previewOpen ? -1 : 0;
      previewButton.tabIndex = previewOpen ? 0 : -1;
      if (previewOpen) {
        renderPreview();
      } else if (focusEditor) {
        textarea.focus();
      }
    }

    function updateStatus() {
      const bytes = encoder.encode(textarea.value).byteLength;
      const references = extractReferenceSequences(textarea.value);
      const tooLarge = Number.isFinite(maxBytes) && maxBytes > 0 && bytes > maxBytes;
      const tooManyReferences = Number.isFinite(maxReferences) && maxReferences > 0 && references.length > maxReferences;
      const parts = [];
      parts.push(bytes.toLocaleString() + " / " + maxBytes.toLocaleString() + " bytes");
      if (references.length > 0 || tooManyReferences) {
        parts.push(references.length.toLocaleString() + " / " + maxReferences.toLocaleString() + " refs");
      }
      status.textContent = parts.join(" · ");
      status.classList.toggle("invalid", tooLarge || tooManyReferences);
      textarea.setCustomValidity(
        tooLarge
          ? "Post exceeds the UTF-8 byte limit."
          : tooManyReferences
            ? "Post contains too many distinct post references."
            : "",
      );
      schedulePreview();
    }

    writeButton.addEventListener("click", () => setMode("write", true));
    previewButton.addEventListener("click", () => setMode("preview", false));

    tabs.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      if (mode === "write") {
        setMode("preview", false);
        previewButton.focus();
      } else {
        setMode("write", false);
        writeButton.focus();
      }
    });

    textarea.addEventListener("input", updateStatus);
    textarea.addEventListener("keydown", (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "b") {
        event.preventDefault();
        toggleWrapSelection(textarea, "**", "**", "bold text");
      } else if (key === "i") {
        event.preventDefault();
        toggleWrapSelection(textarea, "*", "*", "italic text");
      } else if (key === "k") {
        event.preventDefault();
        insertLink(textarea);
      }
    });

    setMode(mode, false);
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
