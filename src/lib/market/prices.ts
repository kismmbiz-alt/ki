// Рынок: цены по модели и памяти из собранных объявлений, снимки по дням, предложенная цена выкупа.

import { prisma, tenant, type Tenant } from "../db";
import { deviceFields } from "../domain/buyback";
import { avitoSearchUrl, fetchAvitoPage } from "../collectors/avito";
import { parseDevice } from "./device";

/** За сколько последних дней берём объявления для расчёта рынка. */
export const MARKET_DAYS = 14;
/** Меньше стольких объявлений — показываем «мало данных». */
export const MIN_COUNT = 5;

export type Stats = { median: number; low: number; high: number; count: number };

const quantile = (sorted: number[], q: number) => {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
};

/** Медиана и «коридор» цен (25–75%), без явных выбросов: «за 1000 ₽ на запчасти» и «новый в плёнке». */
export function priceStats(prices: number[]): Stats | null {
  const a = prices.filter((p) => p > 0).sort((x, y) => x - y);
  if (!a.length) return null;
  const m0 = quantile(a, 0.5);
  const b = a.filter((p) => p >= m0 * 0.5 && p <= m0 * 1.6);
  if (!b.length) return null;
  return { median: quantile(b, 0.5), low: quantile(b, 0.25), high: quantile(b, 0.75), count: b.length };
}

/** Цена выкупа: средняя цена рынка минус сколько хотим заработать, вниз до 500 ₽. */
export function suggestedBuyPrice(median: number, margin: number) {
  const v = median - margin;
  return v > 0 ? Math.floor(v / 50_000) * 50_000 : 0;
}

/** Цены «чистых» объявлений: модель и память распознаны, нет дефектов и замен. */
async function cleanPrices({ db }: Tenant, since: Date, where: { model?: string; memoryGb?: number } = {}) {
  return db.listing.findMany({
    where: { ...where, model: where.model ?? { not: null }, memoryGb: where.memoryGb ?? { not: null }, price: { not: null }, defects: { isEmpty: true }, replacements: { isEmpty: true }, OR: [{ postedAt: { gte: since } }, { postedAt: null, createdAt: { gte: since } }] },
    select: { model: true, memoryGb: true, price: true },
  });
}

export type MarketCell = Stats & { model: string; memoryGb: number; trend: number | null };

/** Таблица рынка: для каждой модели и памяти — медиана, коридор, количество и изменение за 7 дней. */
export async function marketTable(t: Tenant, now = new Date()): Promise<MarketCell[]> {
  const since = new Date(now.getTime() - MARKET_DAYS * 864e5);
  const rows = await cleanPrices(t, since);
  const groups = new Map<string, number[]>();
  for (const r of rows) {
    const k = `${r.model}|${r.memoryGb}`;
    groups.set(k, [...(groups.get(k) ?? []), r.price!]);
  }
  const weekAgo = new Date(now.getTime() - 7 * 864e5);
  const old = await t.db.marketSnapshot.findMany({ where: { day: { gte: new Date(weekAgo.getTime() - 864e5), lte: weekAgo } } });
  const oldMap = new Map(old.map((o) => [`${o.model}|${o.memoryGb}`, o.median]));
  const out: MarketCell[] = [];
  for (const [k, prices] of groups) {
    const s = priceStats(prices);
    if (!s) continue;
    const [model, mem] = k.split("|");
    const prev = oldMap.get(k);
    out.push({ ...s, model, memoryGb: Number(mem), trend: prev ? Math.round(((s.median - prev) / prev) * 1000) / 10 : null });
  }
  return out;
}

const dayOf = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

/** Сохраняет сегодняшний снимок рынка компании: из снимков строятся графики и тренд. */
export async function snapshotCompany(companyId: string, now = new Date()) {
  const t = tenant(companyId);
  const cells = await marketTable(t, now);
  const day = dayOf(now);
  for (const c of cells) {
    const data = { median: c.median, low: c.low, high: c.high, count: c.count };
    await t.db.marketSnapshot.upsert({
      where: { companyId_model_memoryGb_day: { companyId, model: c.model, memoryGb: c.memoryGb, day } },
      create: { companyId, model: c.model, memoryGb: c.memoryGb, day, ...data },
      update: data,
    });
  }
  return cells.length;
}

export async function snapshotAllCompanies() {
  const companies = await prisma.listing.findMany({ distinct: ["companyId"], select: { companyId: true } });
  for (const c of companies) await snapshotCompany(c.companyId);
}

/** Объявления, которые пришли до появления распознавания, разбираем порциями в фоне. */
export async function backfillParsed(limit = 300) {
  const rows = await prisma.listing.findMany({ where: { parsedAt: null }, take: limit, select: { id: true, title: true, text: true } });
  for (const r of rows) await prisma.listing.update({ where: { id: r.id }, data: deviceFields(r.title, r.text) });
  return rows.length;
}

/** История цен модели по дням для графика. */
export async function priceHistory({ db }: Tenant, model: string, memoryGb: number, days = 30) {
  return db.marketSnapshot.findMany({
    where: { model, memoryGb, day: { gte: new Date(Date.now() - days * 864e5) } },
    orderBy: { day: "asc" },
    select: { day: true, median: true, low: true, high: true, count: true },
  });
}

const avitoCache = new Map<string, { at: number; stats: Stats | null; error: string | null }>();

/** Живая оценка по Авито: ищем модель, берём объявления без дефектов. Результат помним 6 часов. */
export async function avitoEstimate(model: string, memoryGb: number, region = "rossiya") {
  if (!process.env.AVITO_PROXY) return { stats: null, error: "Авито ещё не подключён: нужен прокси" };
  const key = `${region}|${model}|${memoryGb}`;
  const hit = avitoCache.get(key);
  if (hit && Date.now() - hit.at < 6 * 36e5) return hit;
  try {
    const posts = await fetchAvitoPage(avitoSearchUrl(`${model} ${memoryGb >= 1024 ? "1 ТБ" : memoryGb + " ГБ"}`, region));
    const prices = posts
      .filter((p) => p.price)
      .filter((p) => {
        const d = parseDevice(`${p.title ?? ""}\n${p.text}`);
        return d.model === model && (d.memoryGb === null || d.memoryGb === memoryGb) && !d.defects.length && !d.replacements.length;
      })
      .map((p) => p.price!);
    const res = { at: Date.now(), stats: priceStats(prices), error: null };
    avitoCache.set(key, res);
    return res;
  } catch (e) {
    const res = { at: Date.now(), stats: null, error: e instanceof Error ? e.message : String(e) };
    avitoCache.set(key, { ...res, at: Date.now() - 5.5 * 36e5 }); // ошибку помним 30 минут
    return res;
  }
}

/** Оценка модели: собранные объявления, ваши продажи выкупленного и (если подключён) Авито прямо сейчас. */
export async function estimate(t: Tenant, model: string, memoryGb: number, region?: string) {
  const since = new Date(Date.now() - MARKET_DAYS * 864e5);
  const listings = priceStats((await cleanPrices(t, since, { model, memoryGb })).map((r) => r.price!));
  const own = await t.db.listing.findMany({ where: { model, memoryGb, status: "BOUGHT", productId: { not: null } }, select: { productId: true } });
  const sold = own.length
    ? await t.db.saleItem.findMany({ where: { productId: { in: own.map((o) => o.productId!) } }, select: { price: true } })
    : [];
  const ownSales = priceStats(sold.map((s) => s.price));
  const avito = await avitoEstimate(model, memoryGb, region);
  return { listings, ownSales, avito };
}
