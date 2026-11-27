import type { ListingSourceKind, PayMethod } from "@prisma/client";
import { prisma, type Tenant } from "../db";
import { moveStockTx } from "./stock";
import { resolveCashbox, resolveWarehouse } from "./places";
import { logAction } from "./log";
import { extractPrice, makeTitle, matchesQuery, type FoundPost } from "../collectors/text";
import { parseDevice } from "../market/device";

/** Поля объявления, которые CRM понимает из текста: модель, память, АКБ, комплект, дефекты, замены. */
export function deviceFields(title: string, text: string) {
  const d = parseDevice(`${title}\n${text}`);
  return { ...d, parsedAt: new Date() };
}

export const SOURCE_KIND_LABEL: Record<ListingSourceKind, string> = {
  VK: "ВКонтакте",
  TELEGRAM: "Telegram",
  AVITO: "Авито",
  YOULA: "Юла",
};
/** Какие источники уже умеем читать. Юла — позже. Авито работает через прокси (AVITO_PROXY). */
export const SUPPORTED_KINDS: ListingSourceKind[] = ["VK", "TELEGRAM", "AVITO"];

export const LISTING_STATUS_LABEL = { NEW: "Новое", IN_WORK: "В работе", BOUGHT: "Выкуплено", REJECTED: "Отказ" } as const;

/** Объявления старше этого срока (кроме взятых в работу и выкупленных) удаляются. */
export const KEEP_DAYS = 30;
/** При первой проверке источника берём посты не старше этого срока, чтобы не завалить ленту старьём. */
export const FRESH_DAYS = 3;

type Actor = { userId: string; isAdmin: boolean };

/** Сохраняет найденные посты источника в ленту. Возвращает, сколько новых добавлено. */
export async function ingestPosts(
  { db, companyId }: Tenant,
  source: { id: string; keywords: string; stopWords: string },
  posts: FoundPost[],
  now = new Date(),
) {
  const fresh = now.getTime() - FRESH_DAYS * 864e5;
  const rows = posts
    .filter((p) => !p.postedAt || p.postedAt.getTime() >= fresh)
    .filter((p) => matchesQuery(p.text, source.keywords, source.stopWords))
    .map((p) => ({
      companyId,
      sourceId: source.id,
      url: p.url,
      title: p.title || makeTitle(p.text),
      text: p.text.slice(0, 5000),
      price: p.price ?? extractPrice(p.text),
      photoUrl: p.photoUrl,
      postedAt: p.postedAt,
      ...deviceFields(p.title ?? "", p.text),
    }));
  if (!rows.length) return 0;
  const res = await db.listing.createMany({ data: rows, skipDuplicates: true });
  return res.count;
}

/** Объявление, найденное сотрудником самостоятельно. */
export async function addManualListing(
  { db, companyId }: Tenant,
  l: { url: string; title?: string; text?: string; price?: number | null; userId: string; take?: boolean },
) {
  const url = l.url.trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("Вставьте ссылку на объявление (начинается с http)");
  const exists = await db.listing.findFirst({ where: { url } });
  if (exists) throw new Error("Это объявление уже есть в ленте");
  const text = l.text?.trim() ?? "";
  const title = l.title?.trim() || makeTitle(text || url);
  return db.listing.create({
    data: {
      companyId,
      url,
      title,
      ...deviceFields(title, text),
      text,
      price: l.price ?? (text ? extractPrice(text) : null),
      ...(l.take ? { status: "IN_WORK" as const, assigneeId: l.userId, takenAt: new Date() } : {}),
    },
  });
}

/** «Беру в работу». Взять можно только свободное объявление — двое не будут звонить одному продавцу. */
export async function takeListing({ db }: Tenant, id: string, userId: string) {
  const res = await db.listing.updateMany({
    where: { id, status: "NEW" },
    data: { status: "IN_WORK", assigneeId: userId, takenAt: new Date() },
  });
  if (res.count !== 1) throw new Error("Объявление уже взял другой сотрудник");
}

async function ownListing({ db }: Tenant, id: string, actor: Actor) {
  const l = await db.listing.findUniqueOrThrow({ where: { id } });
  if (l.status === "BOUGHT") throw new Error("Объявление уже выкуплено");
  if (l.status === "IN_WORK" && l.assigneeId !== actor.userId && !actor.isAdmin) {
    throw new Error("Объявление в работе у другого сотрудника");
  }
  return l;
}

/** Вернуть объявление в общую ленту. */
export async function releaseListing(t: Tenant, id: string, actor: Actor) {
  await ownListing(t, id, actor);
  await t.db.listing.update({ where: { id }, data: { status: "NEW", assigneeId: null, takenAt: null, rejectReason: null } });
}

/** «Не подошло». */
export async function rejectListing(t: Tenant, id: string, actor: Actor, reason: string) {
  const l = await ownListing(t, id, actor);
  if (l.status === "NEW" && !actor.isAdmin) throw new Error("Сначала возьмите объявление в работу");
  await t.db.listing.update({ where: { id }, data: { status: "REJECTED", rejectReason: reason || null } });
}

/**
 * «Выкупил»: техника приходит на склад точки по цене выкупа, деньги уходят из кассы,
 * выкуп засчитывается сотруднику в рейтинг.
 */
export async function buyListing(
  t: Tenant,
  b: { id: string; actor: Actor; locationId: string; warehouseId?: string | null; cashboxId?: string | null; buyPrice: number; productName: string; salePrice?: number; method: PayMethod },
) {
  const { db, companyId } = t;
  if (b.buyPrice <= 0) throw new Error("Укажите, за сколько выкупили");
  const name = b.productName.trim();
  if (!name) throw new Error("Укажите название техники для склада");
  const l = await ownListing(t, b.id, b.actor);
  const userId = l.status === "IN_WORK" && l.assigneeId ? l.assigneeId : b.actor.userId;

  return db.$transaction(async (tx) => {
    // защита от двойного нажатия: выкупить можно только один раз
    const claim = await tx.listing.updateMany({
      where: { id: l.id, status: l.status },
      data: { status: "BOUGHT", assigneeId: userId, takenAt: l.takenAt ?? new Date(), boughtAt: new Date(), buyPrice: b.buyPrice },
    });
    if (claim.count !== 1) throw new Error("Объявление изменилось, обновите страницу");
    const product = await tx.product.create({
      data: { companyId, name, price: b.salePrice ?? 0, cost: b.buyPrice },
    });
    // фиксированный бонус запоминаем в момент выкупа: если потом поменяют настройку, начисленное не изменится
    const { bonusFixed } = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { bonusFixed: true } });
    const warehouseId = await resolveWarehouse(tx, b.locationId, b.warehouseId);
    const cashboxId = await resolveCashbox(tx, b.locationId, b.cashboxId);
    await moveStockTx(tx, {
      productId: product.id,
      warehouseId,
      qty: 1,
      type: "RECEIPT",
      userId,
      cost: b.buyPrice,
      comment: "Выкуп по объявлению",
    });
    await tx.cashTransaction.create({
      data: {
        companyId,
        locationId: b.locationId,
        cashboxId,
        userId: b.actor.userId,
        amount: -b.buyPrice,
        method: b.method,
        category: "Выкуп техники",
        comment: `${name} · ${l.url}`.slice(0, 300),
      },
    });
    await logAction(tx, { companyId, userId: b.actor.userId, locationId: b.locationId, cashboxId, kind: "buyback", text: `Выкуп: ${name}`, amount: -b.buyPrice, link: `/market/search/${l.id}` });
    return tx.listing.update({ where: { id: l.id }, data: { productId: product.id, bonus: bonusFixed } });
  });
}

export type RatingRow = {
  userId: string;
  name: string;
  bought: number;
  spent: number;
  sold: number;
  revenue: number;
  profit: number;
  bonus: number;
  inWork: number;
};

export type ResultItem = {
  id: string;
  title: string;
  model: string | null;
  memoryGb: number | null;
  userId: string;
  userName: string;
  boughtAt: Date;
  buyPrice: number;
  sold: boolean;
  revenue: number;
  profit: number;
  bonus: number;
};

/** Бонус за выкуп: фиксированная часть (запомнена при выкупе) + процент от прибыли после продажи. */
export const bonusFor = (fixed: number, profit: number, percent: number) => fixed + Math.max(0, Math.round((profit * percent) / 100));

/**
 * Результаты выкупа за период: каждая выкупленная техника, кто и когда её выкупил,
 * за сколько продали, прибыль и начисленный бонус; итоги по сотрудникам и по дням.
 */
export async function buybackResults({ db, companyId }: Tenant, from: Date, to: Date) {
  const { bonusPercent } = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { bonusPercent: true } });
  const bought = await db.listing.findMany({
    where: { status: "BOUGHT", boughtAt: { gte: from, lt: to } },
    include: { assignee: true },
    orderBy: { boughtAt: "desc" },
  });
  const productIds = bought.map((l) => l.productId).filter((x): x is string => !!x);
  const saleItems = productIds.length ? await db.saleItem.findMany({ where: { productId: { in: productIds } } }) : [];
  const byProduct = new Map<string, { qty: number; revenue: number; profit: number }>();
  for (const s of saleItems) {
    const cur = byProduct.get(s.productId) ?? { qty: 0, revenue: 0, profit: 0 };
    cur.qty += s.qty;
    cur.revenue += s.qty * s.price;
    cur.profit += s.qty * (s.price - s.cost);
    byProduct.set(s.productId, cur);
  }
  const inWork = await db.listing.groupBy({ by: ["assigneeId"], where: { status: "IN_WORK" }, _count: { _all: true } });
  const users = await db.user.findMany({ where: { isActive: true } });

  const rows = new Map<string, RatingRow>();
  const row = (id: string, name: string) => {
    let r = rows.get(id);
    if (!r) rows.set(id, (r = { userId: id, name, bought: 0, spent: 0, sold: 0, revenue: 0, profit: 0, bonus: 0, inWork: 0 }));
    return r;
  };
  for (const u of users) row(u.id, u.name);

  const items: ResultItem[] = [];
  for (const l of bought) {
    if (!l.assigneeId || !l.assignee || !l.boughtAt) continue;
    const s = l.productId ? byProduct.get(l.productId) : undefined;
    const profit = s?.profit ?? 0;
    const bonus = bonusFor(l.bonus, profit, bonusPercent);
    const r = row(l.assigneeId, l.assignee.name);
    r.bought += 1;
    r.spent += l.buyPrice ?? 0;
    r.bonus += bonus;
    if (s) {
      r.sold += 1;
      r.revenue += s.revenue;
      r.profit += profit;
    }
    items.push({
      id: l.id,
      title: l.title,
      model: l.model,
      memoryGb: l.memoryGb,
      userId: l.assigneeId,
      userName: l.assignee.name,
      boughtAt: l.boughtAt,
      buyPrice: l.buyPrice ?? 0,
      sold: !!s,
      revenue: s?.revenue ?? 0,
      profit,
      bonus,
    });
  }
  for (const w of inWork) if (w.assigneeId && rows.has(w.assigneeId)) rows.get(w.assigneeId)!.inWork = w._count._all;
  const employees = [...rows.values()].sort((a, b) => b.bought - a.bought || b.profit - a.profit || a.name.localeCompare(b.name));

  const total = employees.reduce(
    (t, r) => ({ bought: t.bought + r.bought, spent: t.spent + r.spent, sold: t.sold + r.sold, revenue: t.revenue + r.revenue, profit: t.profit + r.profit, bonus: t.bonus + r.bonus }),
    { bought: 0, spent: 0, sold: 0, revenue: 0, profit: 0, bonus: 0 },
  );
  return { employees, items, total, bonusPercent };
}

/** Рейтинг выкупа за период (для совместимости): итоги по сотрудникам. */
export async function buybackRating(t: Tenant, from: Date, to: Date): Promise<RatingRow[]> {
  return (await buybackResults(t, from, to)).employees;
}
