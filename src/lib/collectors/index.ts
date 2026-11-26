import type { ListingSource } from "@prisma/client";
import { prisma, tenant } from "../db";
import { ingestPosts, KEEP_DAYS } from "../domain/buyback";
import { fetchTelegram } from "./telegram";
import { fetchVk } from "./vk";
import type { FoundPost } from "./text";

/** Как часто проверять один источник. */
export const CHECK_EVERY_MIN = 10;

async function fetchPosts(s: Pick<ListingSource, "kind" | "url">): Promise<FoundPost[]> {
  try {
    if (s.kind === "VK") return await fetchVk(s.url);
    if (s.kind === "TELEGRAM") return await fetchTelegram(s.url);
  } catch (e) {
    // сетевые ошибки fetch приходят без понятного текста
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError") throw new Error("Сайт не ответил за 20 секунд, попробуем позже");
    if (e instanceof TypeError) throw new Error(`Нет связи с ${s.kind === "VK" ? "api.vk.com" : "t.me"} с этого сервера`);
    throw e;
  }
  throw new Error("Этот источник подключим на следующем этапе");
}

/** Проверяет один источник и пишет результат (сколько нашли или ошибку) в сам источник. */
export async function collectSource(source: ListingSource) {
  const t = tenant(source.companyId);
  try {
    const posts = await fetchPosts(source);
    const found = await ingestPosts(t, source, posts);
    await t.db.listingSource.update({ where: { id: source.id }, data: { lastCheckedAt: new Date(), lastError: null, lastFound: found } });
    return { found, error: null as string | null };
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await t.db.listingSource.update({ where: { id: source.id }, data: { lastCheckedAt: new Date(), lastError: msg } });
    return { found: 0, error: msg };
  }
}

/**
 * Один проход сборщика по всем компаниям: источники, которые давно не проверялись, по очереди.
 * Источник «занимается» атомарно, поэтому два процесса не проверят его одновременно.
 */
export async function collectDue(limit = 20) {
  const due = new Date(Date.now() - CHECK_EVERY_MIN * 60_000);
  const sources = await prisma.listingSource.findMany({
    where: { isActive: true, kind: { in: ["VK", "TELEGRAM"] }, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: due } }] },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
    take: limit,
  });
  let found = 0;
  for (const s of sources) {
    const claim = await prisma.listingSource.updateMany({
      where: { id: s.id, lastCheckedAt: s.lastCheckedAt },
      data: { lastCheckedAt: new Date() },
    });
    if (claim.count !== 1) continue;
    found += (await collectSource(s)).found;
    await new Promise((r) => setTimeout(r, 1500)); // не долбим сайты подряд
  }
  return { checked: sources.length, found };
}

/** Удаляет старые объявления, которые никто не взял. Взятые и выкупленные остаются. */
export async function cleanupOld() {
  const before = new Date(Date.now() - KEEP_DAYS * 864e5);
  return prisma.listing.deleteMany({ where: { status: { in: ["NEW", "REJECTED"] }, createdAt: { lt: before } } });
}

let started = false;

/** Запускается вместе с сервером (src/instrumentation.ts): проход раз в минуту, чистка раз в сутки. */
export function startCollector() {
  if (started) return;
  started = true;
  let busy = false;
  let lastCleanup = 0;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await collectDue();
      if (Date.now() - lastCleanup > 864e5) {
        await cleanupOld();
        lastCleanup = Date.now();
      }
    } catch (e) {
      console.error("[скупка] сборщик:", e);
    } finally {
      busy = false;
    }
  };
  setTimeout(tick, 15_000);
  setInterval(tick, 60_000);
  console.log("[скупка] сборщик объявлений запущен");
}
