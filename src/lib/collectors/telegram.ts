import { parse, type HTMLElement } from "node-html-parser";
import type { FoundPost } from "./text";

/** t.me/name, t.me/s/name, @name → name */
export function parseTelegramUrl(url: string): string {
  const s = url.trim();
  const m = s.match(/^@([A-Za-z0-9_]{4,})$/) ?? s.match(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(?:s\/)?([A-Za-z0-9_]{4,})\/?(?:[?#].*)?$/);
  if (!m) throw new Error("Ссылка на Telegram должна быть вида https://t.me/название_канала");
  if (m[1] === "joinchat") throw new Error("Закрытые каналы и чаты пока не поддерживаются");
  return m[1];
}

function textOf(el: HTMLElement | null): string {
  if (!el) return "";
  // <br> → перенос строки, остальное — обычный текст
  const html = el.innerHTML.replace(/<br\s*\/?>/gi, "\n");
  return parse(html)
    .textContent.replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Разбор публичной веб-версии канала t.me/s/<name>. */
export function parseTelegramHtml(html: string, channel: string): FoundPost[] {
  const root = parse(html);
  const messages = root.querySelectorAll(".tgme_widget_message[data-post]");
  if (!messages.length && !root.querySelector(".tgme_channel_info")) {
    throw new Error("Канал не найден, закрыт или это чат (нужен публичный канал)");
  }
  const out: FoundPost[] = [];
  for (const m of messages) {
    const post = m.getAttribute("data-post");
    const text = textOf(m.querySelector(".tgme_widget_message_text"));
    if (!post || !text) continue;
    const time = m.querySelector(".tgme_widget_message_date time")?.getAttribute("datetime");
    const style = m.querySelector(".tgme_widget_message_photo_wrap")?.getAttribute("style") ?? "";
    const photo = style.match(/background-image:url\(['"]?([^'")]+)['"]?\)/)?.[1] ?? null;
    out.push({
      url: `https://t.me/${post.startsWith(channel + "/") ? post : `${channel}/${post.split("/").pop()}`}`,
      text,
      postedAt: time ? new Date(time) : null,
      photoUrl: photo,
    });
  }
  return out;
}

export async function fetchTelegram(url: string): Promise<FoundPost[]> {
  const channel = parseTelegramUrl(url);
  const res = await fetch(`https://t.me/s/${channel}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; crm-buyback/1.0)", "Accept-Language": "ru" },
    signal: AbortSignal.timeout(20_000),
    redirect: "manual",
  });
  if (res.status >= 300 && res.status < 400) throw new Error("Канал не найден или это не публичный канал");
  if (!res.ok) throw new Error(`Telegram ответил ошибкой ${res.status}`);
  return parseTelegramHtml(await res.text(), channel);
}
