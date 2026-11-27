import { parse } from "node-html-parser";
import { ProxyAgent } from "undici";
import type { FoundPost } from "./text";

// Авито не даёт API для поиска чужих объявлений, поэтому читаем обычную страницу поиска,
// как браузер. Без российского мобильного прокси Авито быстро блокирует сервер.

const UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";

/** Ссылка на поиск Авито: годится любая ссылка поиска, скопированная из браузера. */
export function parseAvitoUrl(url: string): string {
  const u = new URL(url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`);
  if (!/(^|\.)avito\.ru$/.test(u.hostname)) throw new Error("Нужна ссылка на поиск Авито (avito.ru/…)");
  u.hostname = "www.avito.ru";
  u.searchParams.set("s", "104"); // сначала новые
  return u.toString();
}

/** Ссылка поиска по тексту в регионе: для оценки цены модели. */
export function avitoSearchUrl(query: string, region = "rossiya") {
  const u = new URL(`https://www.avito.ru/${region}/telefony/mobilnye_telefony`);
  u.searchParams.set("q", query);
  u.searchParams.set("s", "104");
  return u.toString();
}

const RUS_MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** «5 минут назад», «2 часа назад», «вчера», «3 дня назад», «12 ноября» → дата. */
export function parseAvitoDate(s: string, now = new Date()): Date | null {
  const t = s.toLowerCase().trim();
  const m = t.match(/(\d+)\s*(секунд|минут|час|дн|день|недел)/);
  if (m) {
    const n = Number(m[1]);
    const mult = m[2].startsWith("сек") ? 1e3 : m[2].startsWith("мин") ? 6e4 : m[2].startsWith("час") ? 36e5 : m[2].startsWith("нед") ? 7 * 864e5 : 864e5;
    return new Date(now.getTime() - n * mult);
  }
  if (/только что/.test(t)) return now;
  if (/вчера/.test(t)) return new Date(now.getTime() - 864e5);
  const d = t.match(/(\d{1,2})\s+([а-я]+)/);
  if (d) {
    const month = RUS_MONTHS.indexOf(d[2]);
    if (month >= 0) {
      const date = new Date(now.getFullYear(), month, Number(d[1]));
      if (date > now) date.setFullYear(now.getFullYear() - 1);
      return date;
    }
  }
  return null;
}

/** Разбор страницы поиска Авито по стабильным пометкам data-marker. */
export function parseAvitoHtml(html: string, now = new Date()): FoundPost[] {
  const root = parse(html);
  if (/Доступ ограничен|проблема с IP|captcha/i.test(root.querySelector("title")?.textContent ?? "") || root.querySelector("#captcha, .firewall-container")) {
    throw new Error("Авито заблокировал запрос (капча или ограничение по IP). Нужен другой прокси или пауза");
  }
  const items = root.querySelectorAll('[data-marker="item"]');
  const out: FoundPost[] = [];
  for (const it of items) {
    const a = it.querySelector('[data-marker="item-title"]');
    const href = a?.getAttribute("href");
    if (!href) continue;
    const title = (a?.getAttribute("title") ?? a?.textContent ?? "").trim();
    const priceRaw = it.querySelector('meta[itemprop="price"]')?.getAttribute("content") ?? it.querySelector('[data-marker="item-price"]')?.textContent ?? "";
    const rub = Number(String(priceRaw).replace(/[^\d]/g, ""));
    const desc =
      it.querySelector('meta[itemprop="description"]')?.getAttribute("content") ??
      it.querySelector('[class*="descriptionStep"], [class*="item-description"]')?.textContent ??
      "";
    const date = it.querySelector('[data-marker="item-date"]')?.textContent ?? "";
    const img = it.querySelector("img")?.getAttribute("src") ?? null;
    const url = new URL(href, "https://www.avito.ru");
    url.search = "";
    out.push({
      url: url.toString(),
      title: title.slice(0, 200),
      text: [title, desc.trim()].filter(Boolean).join("\n"),
      price: rub > 0 ? rub * 100 : null,
      postedAt: parseAvitoDate(date, now),
      photoUrl: img,
    });
  }
  if (!items.length && !/data-marker="(catalog-serp|page-title)/.test(html)) {
    throw new Error("Авито вернул неожиданную страницу — возможно, изменился сайт или прокси не работает");
  }
  return out;
}

let agent: ProxyAgent | null = null;
let agentFor = "";

/** Загружает страницу Авито через прокси из AVITO_PROXY (http://логин:пароль@адрес:порт). */
export async function fetchAvitoPage(url: string): Promise<FoundPost[]> {
  const proxy = process.env.AVITO_PROXY;
  if (!proxy) throw new Error("Для Авито нужен прокси: задайте AVITO_PROXY на сервере (см. инструкцию)");
  if (!agent || agentFor !== proxy) {
    agent = new ProxyAgent(proxy);
    agentFor = proxy;
  }
  const res = await fetch(url, {
    // @ts-expect-error dispatcher — параметр undici, его понимает встроенный fetch Node.js
    dispatcher: agent,
    headers: { "User-Agent": UA, "Accept-Language": "ru-RU,ru;q=0.9", Accept: "text/html" },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 403 || res.status === 429) throw new Error(`Авито ограничил доступ (${res.status}). Подождём и попробуем снова`);
  if (!res.ok) throw new Error(`Авито ответил ошибкой ${res.status}`);
  return parseAvitoHtml(await res.text());
}

export const fetchAvito = (url: string) => fetchAvitoPage(parseAvitoUrl(url));
