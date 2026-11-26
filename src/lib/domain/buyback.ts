import type { ListingSourceKind, PayMethod } from "@prisma/client";
import type { Tenant } from "../db";
import { moveStockTx } from "./stock";
import { extractPrice, makeTitle, matchesQuery, type FoundPost } from "../collectors/text";

export const SOURCE_KIND_LABEL: Record<ListingSourceKind, string> = {
  VK: "ВКонтакте",
  TELEGRAM: "Telegram",
  AVITO: "Авито",
  YOULA: "Юла",
};
/** Какие источники уже умеем читать. Авито и Юла — следующий этап (нужен прокси). */
export const SUPPORTED_KINDS: ListingSourceKind[] = ["VK", "TELEGRAM"];

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
      title: makeTitle(p.text),
      text: p.text.slice(0, 5000),
      price: extractPrice(p.text),
      photoUrl: p.photoUrl,
      postedAt: p.postedAt,
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
  return db.listing.create({
    data: {
      companyId,
      url,
      title: l.title?.trim() || makeTitle(text || url),
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
  b: { id: string; actor: Actor; locationId: string; buyPrice: number; productName: string; salePrice?: number; method: PayMethod },
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
    await moveStockTx(tx, {
      productId: product.id,
      locationId: b.locationId,
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
        userId: b.actor.userId,
        amount: -b.buyPrice,
        method: b.method,
        category: "Выкуп техники",
        comment: `${name} · ${l.url}`.slice(0, 300),
      },
    });
    return tx.listing.update({ where: { id: l.id }, data: { productId: product.id } });
  });
}

export type RatingRow = { userId: string; name: string; bought: number; spent: number; sold: number; profit: number; inWork: number };

/** Рейтинг выкупа за период: сколько штук, на какую сумму, и сколько заработали на перепродаже. */
export async function buybackRating({ db }: Tenant, from: Date, to: Date): Promise<RatingRow[]> {
  const bought = await db.listing.findMany({
    where: { status: "BOUGHT", boughtAt: { gte: from, lt: to } },
    include: { assignee: true },
  });
  const productIds = bought.map((l) => l.productId).filter((x): x is string => !!x);
  const saleItems = productIds.length ? await db.saleItem.findMany({ where: { productId: { in: productIds } } }) : [];
  const byProduct = new Map<string, { qty: number; profit: number }>();
  for (const s of saleItems) {
    const cur = byProduct.get(s.productId) ?? { qty: 0, profit: 0 };
    cur.qty += s.qty;
    cur.profit += s.qty * (s.price - s.cost);
    byProduct.set(s.productId, cur);
  }
  const inWork = await db.listing.groupBy({ by: ["assigneeId"], where: { status: "IN_WORK" }, _count: { _all: true } });
  const users = await db.user.findMany({ where: { isActive: true } });

  const rows = new Map<string, RatingRow>();
  const row = (id: string, name: string) => {
    let r = rows.get(id);
    if (!r) rows.set(id, (r = { userId: id, name, bought: 0, spent: 0, sold: 0, profit: 0, inWork: 0 }));
    return r;
  };
  for (const u of users) row(u.id, u.name);
  for (const l of bought) {
    if (!l.assigneeId || !l.assignee) continue;
    const r = row(l.assigneeId, l.assignee.name);
    r.bought += 1;
    r.spent += l.buyPrice ?? 0;
    const s = l.productId ? byProduct.get(l.productId) : undefined;
    if (s) {
      r.sold += Math.min(s.qty, 1);
      r.profit += s.profit;
    }
  }
  for (const w of inWork) if (w.assigneeId && rows.has(w.assigneeId)) rows.get(w.assigneeId)!.inWork = w._count._all;
  return [...rows.values()].sort((a, b) => b.bought - a.bought || b.profit - a.profit || a.name.localeCompare(b.name));
}
