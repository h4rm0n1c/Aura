export const REPLY_CLIENT_JS = String.raw`
(() => {
  "use strict";

  const REFRESH_MS = 30_000;
  const MIN_REFRESH_GAP_MS = 2_000;

  const root = document.querySelector("[data-reply-nav]");
  if (!(root instanceof HTMLElement)) return;
  const badge = root.querySelector("[data-reply-count]");
  const toggle = root.querySelector("[data-reply-toggle]");
  const menu = root.querySelector("[data-reply-menu]");
  if (!(badge instanceof HTMLElement) || !(toggle instanceof HTMLButtonElement) || !(menu instanceof HTMLElement)) return;

  let refreshing = false;
  let lastRefreshAt = 0;

  const closeMenu = () => {
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  };

  const openMenu = () => {
    menu.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  };

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

  const renderSummary = (data) => {
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
  };

  const refreshSummary = async (force = false) => {
    if (refreshing || document.hidden) return;
    const now = Date.now();
    if (!force && now - lastRefreshAt < MIN_REFRESH_GAP_MS) return;
    refreshing = true;
    try {
      const response = await fetch("/replies/summary", {
        method: "GET",
        credentials: "same-origin",
        headers: { "Accept": "application/json" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("reply summary unavailable");
      renderSummary(await response.json());
      lastRefreshAt = Date.now();
    } catch {
      // Progressive enhancement only. Keep the last successful state and leave
      // the ordinary /replies link usable when the summary endpoint is unavailable.
    } finally {
      refreshing = false;
    }
  };

  toggle.addEventListener("click", () => {
    if (menu.hidden) {
      void refreshSummary(true);
      openMenu();
    } else {
      closeMenu();
    }
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
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void refreshSummary(true);
  });
  window.addEventListener("focus", () => {
    void refreshSummary(true);
  });

  void refreshSummary(true);
  window.setInterval(() => {
    void refreshSummary(false);
  }, REFRESH_MS);
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
