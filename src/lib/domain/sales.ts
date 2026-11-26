import type { PayMethod } from "@prisma/client";
import type { Tenant } from "../db";
import { prisma } from "../db";
import { moveStockTx } from "./stock";
import { normalizePhone } from "./orders";

async function nextSaleNumber(companyId: string) {
  const { saleSeq } = await prisma.company.update({ where: { id: companyId }, data: { saleSeq: { increment: 1 } }, select: { saleSeq: true } });
  return saleSeq;
}

/** Продажа товара без заказа: списание со склада точки и приход в кассу. */
export async function createSale(
  { db, companyId }: Tenant,
  s: {
    locationId: string;
    userId: string;
    clientId?: string | null;
    client?: { phone?: string; name?: string } | null;
    method: PayMethod;
    discount?: number; // скидка на чек, коп.
    allowBelowMin?: boolean; // владельцу можно продать ниже минимальной цены
    items: { productId: string; qty: number; price?: number }[];
  },
) {
  const items = s.items.filter((i) => i.qty > 0);
  if (!items.length) throw new Error("Добавьте хотя бы один товар");
  return db.$transaction(async (tx) => {
    let clientId = s.clientId || null;
    if (!clientId && s.client?.phone) {
      const phone = normalizePhone(s.client.phone);
      if (phone.length >= 8) {
        const ex = await tx.client.findFirst({ where: { phone } });
        clientId = ex?.id ?? (await tx.client.create({ data: { companyId, phone, name: s.client.name?.trim() || "Без имени" } })).id;
      }
    }
    const rows = [];
    for (const i of items) {
      const p = await tx.product.findUniqueOrThrow({ where: { id: i.productId } });
      const price = i.price ?? p.price;
      if (price < 0) throw new Error("Цена не может быть отрицательной");
      if (!s.allowBelowMin && p.minPrice && price < p.minPrice)
        throw new Error(`«${p.name}»: цена ниже минимальной (${(p.minPrice / 100).toLocaleString("ru-RU")} ₽)`);
      rows.push({ productId: p.id, name: p.name, qty: i.qty, price, cost: p.cost });
    }
    const sum = rows.reduce((acc, r) => acc + r.qty * r.price, 0);
    const discount = Math.min(Math.max(0, s.discount ?? 0), sum);
    const total = sum - discount;
    const number = await nextSaleNumber(companyId);
    const sale = await tx.sale.create({
      data: { companyId, locationId: s.locationId, number, clientId, userId: s.userId, total, discount },
    });
    for (const r of rows) {
      await tx.saleItem.create({ data: { companyId, saleId: sale.id, ...r } });
      await moveStockTx(tx, { productId: r.productId, locationId: s.locationId, qty: -r.qty, type: "SALE", userId: s.userId, comment: `Продажа №${number}` });
    }
    if (total > 0)
      await tx.cashTransaction.create({
        data: { companyId, locationId: s.locationId, userId: s.userId, saleId: sale.id, amount: total, method: s.method, category: "Продажа", comment: `Продажа №${number}` },
      });
    return sale;
  });
}

/**
 * Возврат по продаже: товар возвращается на склад, деньги уходят из кассы.
 * Можно вернуть часть позиций; повторно вернуть больше проданного нельзя.
 */
export async function returnSale(
  { db, companyId }: Tenant,
  r: { saleId: string; userId: string; method: PayMethod; items: { saleItemId: string; qty: number }[]; reason?: string },
) {
  const want = r.items.filter((i) => i.qty > 0);
  if (!want.length) throw new Error("Отметьте, что возвращаете");
  return db.$transaction(async (tx) => {
    const sale = await tx.sale.findUniqueOrThrow({ where: { id: r.saleId }, include: { items: true } });
    if (sale.isReturn) throw new Error("Это уже возврат");
    const prev = await tx.sale.findMany({ where: { returnOfId: sale.id }, include: { items: true } });
    const returned = new Map<string, number>();
    for (const p of prev) for (const i of p.items) returned.set(i.productId, (returned.get(i.productId) ?? 0) + i.qty);
    const sum = sale.items.reduce((a, i) => a + i.qty * i.price, 0);
    const k = sum > 0 ? sale.total / sum : 1; // доля скидки чека
    const rows = [];
    for (const w of want) {
      const it = sale.items.find((i) => i.id === w.saleItemId);
      if (!it) throw new Error("Позиция не из этой продажи");
      const left = it.qty - (returned.get(it.productId) ?? 0);
      if (w.qty > left) throw new Error(`«${it.name}»: можно вернуть не больше ${left} шт`);
      returned.set(it.productId, (returned.get(it.productId) ?? 0) + w.qty);
      rows.push({ productId: it.productId, name: it.name, qty: w.qty, price: Math.round(it.price * k), cost: it.cost });
    }
    const total = rows.reduce((a, x) => a + x.qty * x.price, 0);
    const number = await nextSaleNumber(companyId);
    const ret = await tx.sale.create({
      data: { companyId, locationId: sale.locationId, number, clientId: sale.clientId, userId: r.userId, total: -total, isReturn: true, returnOfId: sale.id },
    });
    for (const x of rows) {
      await tx.saleItem.create({ data: { companyId, saleId: ret.id, ...x } });
      await moveStockTx(tx, { productId: x.productId, locationId: sale.locationId, qty: x.qty, type: "RETURN", userId: r.userId, comment: `Возврат по продаже №${sale.number}` });
    }
    if (total > 0)
      await tx.cashTransaction.create({
        data: {
          companyId,
          locationId: sale.locationId,
          userId: r.userId,
          saleId: ret.id,
          amount: -total,
          method: r.method,
          category: "Возврат продажи",
          comment: `Возврат №${number} по продаже №${sale.number}${r.reason ? `: ${r.reason}` : ""}`,
        },
      });
    return ret;
  });
}

// ---------- Кассовая смена ----------

export async function currentShift({ db }: Tenant, locationId: string) {
  return db.cashShift.findFirst({ where: { locationId, closedAt: null }, orderBy: { openedAt: "desc" } });
}

/** Наличные в кассе точки по учёту (все операции наличными). */
export async function cashOnHand({ db }: Tenant, locationId: string) {
  const a = await db.cashTransaction.aggregate({ where: { locationId, method: "CASH" }, _sum: { amount: true } });
  return a._sum.amount ?? 0;
}

export async function openShift(t: Tenant, s: { locationId: string; userId: string }) {
  if (await currentShift(t, s.locationId)) throw new Error("Смена уже открыта");
  const openCash = await cashOnHand(t, s.locationId);
  return t.db.cashShift.create({ data: { companyId: t.companyId, locationId: s.locationId, openedById: s.userId, openCash } });
}

/** Итоги смены: продажи, возвраты, оплаты заказов, расходы по способам оплаты. */
export async function shiftSummary({ db }: Tenant, locationId: string, from: Date, to: Date) {
  const tx = await db.cashTransaction.findMany({ where: { locationId, createdAt: { gte: from, lt: to } } });
  const by = (f: (x: (typeof tx)[number]) => boolean) => {
    const out = { CASH: 0, CARD: 0, TRANSFER: 0, total: 0 };
    for (const x of tx.filter(f)) {
      out[x.method] += x.amount;
      out.total += x.amount;
    }
    return out;
  };
  return {
    sales: by((x) => !!x.saleId && x.amount > 0),
    returns: by((x) => !!x.saleId && x.amount < 0),
    orders: by((x) => !!x.orderId),
    other: by((x) => !x.saleId && !x.orderId),
    all: by(() => true),
    count: tx.length,
  };
}

export async function closeShift(t: Tenant, s: { locationId: string; userId: string; closeCash: number; comment?: string | null }) {
  const shift = await currentShift(t, s.locationId);
  if (!shift) throw new Error("Смена не открыта");
  const expectedCash = await cashOnHand(t, s.locationId);
  const diff = s.closeCash - expectedCash;
  if (diff !== 0) {
    // расхождение фиксируем отдельной операцией, чтобы остаток в кассе совпал с фактом
    await t.db.cashTransaction.create({
      data: {
        companyId: t.companyId,
        locationId: s.locationId,
        userId: s.userId,
        amount: diff,
        method: "CASH",
        category: diff > 0 ? "Излишек при закрытии смены" : "Недостача при закрытии смены",
        comment: s.comment || null,
      },
    });
  }
  return t.db.cashShift.update({
    where: { id: shift.id },
    data: { closedAt: new Date(), closedById: s.userId, expectedCash, closeCash: s.closeCash, comment: s.comment || null },
  });
}
