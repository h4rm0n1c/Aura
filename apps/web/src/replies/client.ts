export const REPLY_CLIENT_JS = String.raw`
(() => {
  "use strict";

  const root = document.querySelector("[data-reply-nav]");
  if (!(root instanceof HTMLElement)) return;
  const badge = root.querySelector("[data-reply-count]");
  const toggle = root.querySelector("[data-reply-toggle]");
  const menu = root.querySelector("[data-reply-menu]");
  if (!(badge instanceof HTMLElement) || !(toggle instanceof HTMLButtonElement) || !(menu instanceof HTMLElement)) return;

  const closeMenu = () => {
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  };

  const openMenu = () => {
    menu.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  };

  toggle.addEventListener("click", () => {
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  document.addEventListener("click", (event) => {
    if (!root.contains(event.target)) closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      closeMenu();
      toggle.focus();
    }
  });

  const makeItem = (item) => {
    const link = document.createElement("a");
    link.className = "reply-menu-item";
    link.href = "/t/" + encodeURIComponent(item.threadId) + "#p-" + encodeURIComponent(item.replyPostId);
    const who = typeof item.replyAuthorName === "string" ? item.replyAuthorName : "Someone";
    const board = typeof item.boardSlug === "string" ? item.boardSlug : "?";
    const target = Number.isSafeInteger(item.targetSequence) ? item.targetSequence : "?";
    const source = Number.isSafeInteger(item.replySequence) ? item.replySequence : "?";
    link.textContent = who + " replied to >>" + target + " in /" + board + "/ · >>" + source;
    return link;
  };

  fetch("/replies/summary", {
    method: "GET",
    credentials: "same-origin",
    headers: { "Accept": "application/json" },
  }).then((response) => {
    if (!response.ok) throw new Error("reply summary unavailable");
    return response.json();
  }).then((data) => {
    const count = Number.isSafeInteger(data.unreadCount) && data.unreadCount >= 0 ? data.unreadCount : 0;
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count === 0;

    menu.replaceChildren();
    const items = Array.isArray(data.items) ? data.items.slice(0, 6) : [];
    for (const item of items) menu.append(makeItem(item));

    if (items.length === 0) {
      const empty = document.createElement("span");
      empty.className = "reply-menu-empty";
      empty.textContent = "No unread replies.";
      menu.append(empty);
    }

    const footer = document.createElement("a");
    footer.className = "reply-menu-all";
    footer.href = "/replies";
    footer.textContent = count > items.length ? "View all " + count + " replies" : "Open reply inbox";
    menu.append(footer);

    toggle.hidden = false;
  }).catch(() => {
    // Progressive enhancement only. The ordinary /replies link remains usable.
  });
})();
`;

export function replyClientScriptResponse(): Response {
  return new Response(REPLY_CLIENT_JS, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
