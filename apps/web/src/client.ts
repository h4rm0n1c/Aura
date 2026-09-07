export const AURA_CLIENT_JS = String.raw`(() => {
  "use strict";

  function replyReference(link) {
    const sequence = link.dataset.postSequence;
    if (!sequence || !/^[1-9][0-9]{0,8}$/.test(sequence)) return;

    const textarea = document.getElementById("reply-body");
    if (!(textarea instanceof HTMLTextAreaElement)) return;

    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const before = textarea.value.slice(0, start);
    const needsLeadingNewline = before.length > 0 && !before.endsWith("\n");
    const insertion = `${needsLeadingNewline ? "\n" : ""}>>${sequence}\n`;

    textarea.setRangeText(insertion, start, end, "end");
    textarea.focus({ preventScroll: true });
    textarea.scrollIntoView({ block: "center", behavior: "auto" });
  }

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest("a.post-reply[data-post-sequence]");
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
