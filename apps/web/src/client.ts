export const AURA_CLIENT_JS = String.raw`(() => {
  "use strict";

  const TICK = String.fromCharCode(96);
  const FENCE = TICK.repeat(3);
  const encoder = new TextEncoder();
  const MAX_INLINE_DEPTH = 16;
  const MAX_BLOCK_DEPTH = 12;

  function dispatchInput(textarea) {
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

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

    replaceText(textarea, start, end, insertion, start + insertion.length, start + insertion.length);
    textarea.scrollIntoView({ block: "center", behavior: "auto" });
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

  function appendInline(parent, source, refs, depth = 0) {
    if (depth >= MAX_INLINE_DEPTH) {
      appendText(parent, source);
      return;
    }

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
          appendInline(strong, source.slice(index + 2, end), refs, depth + 1);
          parent.appendChild(strong);
          index = end + 2;
          continue;
        }
      }

      if (source.startsWith("~~", index)) {
        const end = source.indexOf("~~", index + 2);
        if (end !== -1) {
          const del = document.createElement("del");
          appendInline(del, source.slice(index + 2, end), refs, depth + 1);
          parent.appendChild(del);
          index = end + 2;
          continue;
        }
      }

      if (source[index] === "*") {
        const end = source.indexOf("*", index + 1);
        if (end !== -1) {
          const em = document.createElement("em");
          appendInline(em, source.slice(index + 1, end), refs, depth + 1);
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
              appendInline(anchor, source.slice(index + 1, labelEnd), new Map(), depth + 1);
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
      /^\s*[-+*]\s+(.+)$/.test(line) ||
      /^\s*\d+\.\s+(.+)$/.test(line) ||
      isHorizontalRule(line);
  }

  function renderMarkdownInto(container, source, refs, depth = 0) {
    container.replaceChildren();
    if (depth >= MAX_BLOCK_DEPTH) {
      appendText(container, source);
      return;
    }

    const lines = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
    let index = 0;
    let guard = 0;
    const guardLimit = lines.length * 4 + 32;

    while (index < lines.length && guard < guardLimit) {
      guard += 1;
      const startIndex = index;
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
        renderMarkdownInto(blockquote, quoted.join("\n"), refs, depth + 1);
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

      if (index === startIndex) index += 1;
    }

    if (guard >= guardLimit && index < lines.length) {
      const stopped = document.createElement("p");
      stopped.className = "meta";
      stopped.textContent = "Preview stopped because the draft was too complex to render safely.";
      container.appendChild(stopped);
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

  function replaceText(textarea, start, end, replacement, selectionStart, selectionEnd) {
    const scrollTop = textarea.scrollTop;
    const scrollLeft = textarea.scrollLeft;
    textarea.setRangeText(replacement, start, end, "end");
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(selectionStart, selectionEnd);
    textarea.scrollTop = scrollTop;
    textarea.scrollLeft = scrollLeft;
    dispatchInput(textarea);
  }

  function wordSelectionRange(textarea) {
    const originalStart = textarea.selectionStart ?? textarea.value.length;
    const originalEnd = textarea.selectionEnd ?? originalStart;
    if (originalStart !== originalEnd) {
      return { start: originalStart, end: originalEnd, hadSelection: true, expandedWord: false };
    }

    let start = originalStart;
    let end = originalEnd;
    const value = textarea.value;
    while (start > 0 && !/\s/.test(value[start - 1])) start -= 1;
    while (end < value.length && !/\s/.test(value[end])) end += 1;

    if (start === end) {
      return { start: originalStart, end: originalEnd, hadSelection: false, expandedWord: false };
    }
    return { start, end, hadSelection: false, expandedWord: true };
  }

  function toggleWrapSelection(textarea, before, after) {
    const range = wordSelectionRange(textarea);
    const selected = textarea.value.slice(range.start, range.end);

    if (selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length) {
      const content = selected.slice(before.length, selected.length - after.length);
      replaceText(textarea, range.start, range.end, content, range.start + content.length, range.start + content.length);
      return;
    }

    const wrappedBefore = textarea.value.slice(Math.max(0, range.start - before.length), range.start) === before;
    const wrappedAfter = textarea.value.slice(range.end, range.end + after.length) === after;
    if (wrappedBefore && wrappedAfter) {
      replaceText(
        textarea,
        range.start - before.length,
        range.end + after.length,
        selected,
        range.start - before.length + selected.length,
        range.start - before.length + selected.length,
      );
      return;
    }

    if (selected.length === 0) {
      const replacement = before + after;
      replaceText(textarea, range.start, range.end, replacement, range.start + before.length, range.start + before.length);
      return;
    }

    const replacement = before + selected + after;
    replaceText(textarea, range.start, range.end, replacement, range.start + replacement.length, range.start + replacement.length);
  }

  function selectedLineRange(textarea) {
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? start;
    const lineStart = textarea.value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const nextBreak = textarea.value.indexOf("\n", end);
    const lineEnd = nextBreak === -1 ? textarea.value.length : nextBreak;
    return { lineStart, lineEnd, start, end, hadSelection: start !== end };
  }

  function indentationAndContent(line) {
    const match = /^(\s*)(.*)$/.exec(line);
    return { indent: match?.[1] ?? "", content: match?.[2] ?? line };
  }

  function stripListMarker(line) {
    const parts = indentationAndContent(line);
    return parts.indent + parts.content.replace(/^(?:[-+*]\s+|\d+\.\s+)/, "");
  }

  function prefixLine(line, prefix) {
    const parts = indentationAndContent(line);
    return parts.indent + prefix + parts.content;
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

    if (range.hadSelection) {
      replaceText(textarea, range.lineStart, range.lineEnd, replacement, range.lineStart, range.lineStart + replacement.length);
      return;
    }

    const oldLine = selected;
    const oldCaretOffset = range.start - range.lineStart;
    const oldIndent = /^\s*/.exec(oldLine)?.[0].length ?? 0;
    const newIndent = /^\s*/.exec(replacement)?.[0].length ?? 0;
    const oldMarker = /^(?:\s*)(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+\.\s+)?/.exec(oldLine)?.[0].length ?? oldIndent;
    const newMarker = /^(?:\s*)(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+\.\s+)?/.exec(replacement)?.[0].length ?? newIndent;
    let caret = range.lineStart + oldCaretOffset + (newMarker - oldMarker);
    if (oldLine.trim().length === 0) caret = range.lineStart + newMarker;
    caret = Math.max(range.lineStart, Math.min(range.lineStart + replacement.length, caret));
    replaceText(textarea, range.lineStart, range.lineEnd, replacement, caret, caret);
  }

  function toggleQuote(textarea) {
    transformSelectedLines(
      textarea,
      (line) => /^\s*>\s?/.test(line) && !/^\s*>>/.test(line),
      (line) => prefixLine(line, "> "),
      (line) => line.replace(/^(\s*)>\s?/, "$1"),
    );
  }

  function toggleBulletList(textarea) {
    transformSelectedLines(
      textarea,
      (line) => /^\s*[-+*]\s+/.test(line),
      (line) => prefixLine(stripListMarker(line), "- "),
      (line) => line.replace(/^(\s*)[-+*]\s+/, "$1"),
    );
  }

  function toggleOrderedList(textarea) {
    transformSelectedLines(
      textarea,
      (line) => /^\s*\d+\.\s+/.test(line),
      (line, index) => prefixLine(stripListMarker(line), String(index + 1) + ". "),
      (line) => line.replace(/^(\s*)\d+\.\s+/, "$1"),
    );
  }

  function toggleHeading(textarea) {
    transformSelectedLines(
      textarea,
      (line) => /^\s*#{1,6}\s+/.test(line),
      (line) => prefixLine(line, "# "),
      (line) => line.replace(/^(\s*)#{1,6}\s+/, "$1"),
    );
  }

  function insertCode(textarea) {
    const range = wordSelectionRange(textarea);
    const selected = textarea.value.slice(range.start, range.end);

    if (selected.includes("\n")) {
      const before = textarea.value.slice(0, range.start);
      const after = textarea.value.slice(range.end);
      const leading = before.length > 0 && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
      const trailing = after.length > 0 && !after.startsWith("\n\n") ? (after.startsWith("\n") ? "\n" : "\n\n") : "";
      const replacement = leading + FENCE + "\n" + selected + "\n" + FENCE + trailing;
      replaceText(textarea, range.start, range.end, replacement, range.start + replacement.length, range.start + replacement.length);
      return;
    }

    toggleWrapSelection(textarea, TICK, TICK);
  }

  function insertLink(textarea) {
    const range = wordSelectionRange(textarea);
    const selected = textarea.value.slice(range.start, range.end);
    const selectedHref = selected ? safeHref(selected.trim()) : null;

    if (selectedHref !== null) {
      const replacement = "[link text](" + selectedHref + ")";
      replaceText(textarea, range.start, range.end, replacement, range.start + 1, range.start + 10);
      return;
    }

    if (selected.length > 0) {
      const replacement = "[" + selected + "](https://)";
      const urlStart = range.start + selected.length + 3;
      replaceText(textarea, range.start, range.end, replacement, urlStart, urlStart + 8);
      return;
    }

    const replacement = "[](https://)";
    replaceText(textarea, range.start, range.end, replacement, range.start + 1, range.start + 1);
  }

  function insertHorizontalRule(textarea) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    const leading = before.length === 0 ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const trailing = after.length === 0 ? "\n" : after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
    const insertion = leading + "---" + trailing;
    replaceText(textarea, start, end, insertion, start + insertion.length, start + insertion.length);
  }

  function currentLineBeforeCaret(textarea) {
    const caret = textarea.selectionStart ?? 0;
    const lineStart = textarea.value.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
    return { caret, lineStart, text: textarea.value.slice(lineStart, caret) };
  }

  function continueMarkdownLine(textarea, event) {
    if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;
    if ((textarea.selectionStart ?? 0) !== (textarea.selectionEnd ?? 0)) return false;

    const current = currentLineBeforeCaret(textarea);
    const bullet = /^(\s*)([-+*])\s+(.*)$/.exec(current.text);
    const ordered = /^(\s*)(\d+)\.\s+(.*)$/.exec(current.text);
    const quote = /^(\s*)>\s?(.*)$/.exec(current.text);

    if (bullet !== null) {
      event.preventDefault();
      if (bullet[3].trim().length === 0) {
        replaceText(textarea, current.lineStart, current.caret, bullet[1], current.lineStart + bullet[1].length, current.lineStart + bullet[1].length);
      } else {
        const insertion = "\n" + bullet[1] + bullet[2] + " ";
        replaceText(textarea, current.caret, current.caret, insertion, current.caret + insertion.length, current.caret + insertion.length);
      }
      return true;
    }

    if (ordered !== null) {
      event.preventDefault();
      if (ordered[3].trim().length === 0) {
        replaceText(textarea, current.lineStart, current.caret, ordered[1], current.lineStart + ordered[1].length, current.lineStart + ordered[1].length);
      } else {
        const insertion = "\n" + ordered[1] + String(Number(ordered[2]) + 1) + ". ";
        replaceText(textarea, current.caret, current.caret, insertion, current.caret + insertion.length, current.caret + insertion.length);
      }
      return true;
    }

    if (quote !== null) {
      event.preventDefault();
      if (quote[2].trim().length === 0) {
        replaceText(textarea, current.lineStart, current.caret, quote[1], current.lineStart + quote[1].length, current.lineStart + quote[1].length);
      } else {
        const insertion = "\n" + quote[1] + "> ";
        replaceText(textarea, current.caret, current.caret, insertion, current.caret + insertion.length, current.caret + insertion.length);
      }
      return true;
    }

    return false;
  }

  function removeEmptyMarkerOnBackspace(textarea, event) {
    if (event.key !== "Backspace" || event.ctrlKey || event.metaKey || event.altKey) return false;
    if ((textarea.selectionStart ?? 0) !== (textarea.selectionEnd ?? 0)) return false;

    const current = currentLineBeforeCaret(textarea);
    const marker = /^(\s*)(?:[-+*]\s+|\d+\.\s+|>\s?)$/.exec(current.text);
    if (marker === null) return false;

    event.preventDefault();
    replaceText(textarea, current.lineStart, current.caret, marker[1], current.lineStart + marker[1].length, current.lineStart + marker[1].length);
    return true;
  }

  function toolbarButton(label, title, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "markdown-editor-tool";
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.dataset.editorAction = "true";
    button.addEventListener("click", action);
    return button;
  }

  function toolbarSeparator() {
    const separator = document.createElement("span");
    separator.className = "markdown-editor-separator";
    separator.setAttribute("role", "separator");
    return separator;
  }

  function enhanceToolbarKeyboard(toolbar) {
    const buttons = () => [...toolbar.querySelectorAll("button.markdown-editor-tool")];
    const all = buttons();
    all.forEach((button, index) => { button.tabIndex = index === 0 ? 0 : -1; });

    toolbar.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const current = event.target;
      if (!(current instanceof HTMLButtonElement)) return;
      const items = buttons();
      const index = items.indexOf(current);
      if (index === -1) return;

      event.preventDefault();
      let next = index;
      if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
      if (event.key === "ArrowRight") next = (index + 1) % items.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = items.length - 1;
      items.forEach((button, buttonIndex) => { button.tabIndex = buttonIndex === next ? 0 : -1; });
      items[next]?.focus();
    });
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

    let savedSelectionStart = textarea.selectionStart ?? 0;
    let savedSelectionEnd = textarea.selectionEnd ?? savedSelectionStart;
    function rememberSelection() {
      savedSelectionStart = textarea.selectionStart ?? textarea.value.length;
      savedSelectionEnd = textarea.selectionEnd ?? savedSelectionStart;
    }
    function restoreSelection() {
      textarea.setSelectionRange(savedSelectionStart, savedSelectionEnd);
    }
    function action(handler) {
      return () => {
        restoreSelection();
        handler();
        rememberSelection();
      };
    }

    toolbar.append(
      toolbarButton("H", "Heading", action(() => toggleHeading(textarea))),
      toolbarButton("B", "Bold (Ctrl+B)", action(() => toggleWrapSelection(textarea, "**", "**"))),
      toolbarButton("I", "Italic (Ctrl+I)", action(() => toggleWrapSelection(textarea, "*", "*"))),
      toolbarButton("S", "Strikethrough", action(() => toggleWrapSelection(textarea, "~~", "~~"))),
      toolbarSeparator(),
      toolbarButton("Link", "Link (Ctrl+K)", action(() => insertLink(textarea))),
      toolbarButton("Code", "Inline or fenced code", action(() => insertCode(textarea))),
      toolbarButton("Quote", "Quote selected line(s)", action(() => toggleQuote(textarea))),
      toolbarSeparator(),
      toolbarButton("• List", "Bulleted list", action(() => toggleBulletList(textarea))),
      toolbarButton("1. List", "Numbered list", action(() => toggleOrderedList(textarea))),
      toolbarButton("—", "Horizontal rule", action(() => insertHorizontalRule(textarea))),
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
    enhanceToolbarKeyboard(toolbar);

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
        rememberSelection();
      }
    }

    function updateStatus() {
      rememberSelection();
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

    textarea.addEventListener("select", rememberSelection);
    textarea.addEventListener("pointerup", rememberSelection);
    textarea.addEventListener("keyup", rememberSelection);
    textarea.addEventListener("input", updateStatus);
    textarea.addEventListener("keydown", (event) => {
      if (continueMarkdownLine(textarea, event)) return;
      if (removeEmptyMarkerOnBackspace(textarea, event)) return;

      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "b") {
        event.preventDefault();
        toggleWrapSelection(textarea, "**", "**");
      } else if (key === "i") {
        event.preventDefault();
        toggleWrapSelection(textarea, "*", "*");
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
