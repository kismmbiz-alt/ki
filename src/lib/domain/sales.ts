import type { PayMethod } from "@prisma/client";
import type { Tenant } from "../db";
import { prisma } from "../db";
import { moveStockTx } from "./stock";
import { normalizePhone } from "./orders";
import { defaultCashboxId, resolveCashbox, resolveWarehouse } from "./places";
import { logAction } from "./log";
import { PAY_LABEL } from "./cash";
import { accrueBonus, spendBonus } from "./bonus";

async function nextSaleNumber(companyId: string) {
  const { saleSeq } = await prisma.company.update({ where: { id: companyId }, data: { saleSeq: { increment: 1 } }, select: { saleSeq: true } });
  return saleSeq;
}

/** Продажа товара без заказа: списание со склада точки и приход в кассу. */
export async function createSale(
  { db, companyId }: Tenant,
  s: {
    locationId: string;
    warehouseId?: string | null;
    cashboxId?: string | null;
    userId: string;
    clientId?: string | null;
    client?: { phone?: string; name?: string } | null;
    method: PayMethod;
    discount?: number; // скидка на чек, коп.
    allowBelowMin?: boolean; // владельцу можно продать ниже минимальной цены
    bonusPay?: number; // оплата баллами, коп.
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
    const warehouseId = await resolveWarehouse(tx, s.locationId, s.warehouseId);
    const wh = await tx.warehouse.findUniqueOrThrow({ where: { id: warehouseId } });
    const cashboxId = await resolveCashbox(tx, s.locationId, s.cashboxId || wh.cashboxId);
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
    const rules = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
    const bonusPay = Math.max(0, Math.round(s.bonusPay ?? 0));
    if (bonusPay && !clientId) throw new Error("Чтобы оплатить баллами, укажите телефон клиента");
    if (bonusPay > total) throw new Error("Баллами нельзя оплатить больше суммы чека");
    const number = await nextSaleNumber(companyId);
    const sale = await tx.sale.create({
      data: { companyId, locationId: s.locationId, warehouseId, number, clientId, userId: s.userId, total, discount, bonusPaid: bonusPay },
    });
    if (bonusPay) await spendBonus(tx, companyId, rules, { clientId: clientId!, amount: bonusPay, checkTotal: total, saleId: sale.id, userId: s.userId, comment: `Продажа №${number}` });
    await accrueBonus(tx, companyId, rules, {
      clientId,
      base: rules.bonusAccrueOnBonusPay ? total : total - bonusPay,
      pct: rules.bonusSalePct,
      saleId: sale.id,
      userId: s.userId,
      comment: `Продажа №${number}`,
    });
    for (const r of rows) {
      await tx.saleItem.create({ data: { companyId, saleId: sale.id, ...r } });
      await moveStockTx(tx, { productId: r.productId, warehouseId, qty: -r.qty, type: "SALE", userId: s.userId, comment: `Продажа №${number}`, link: `/sales/${sale.id}` });
    }
    if (total - bonusPay > 0)
      await tx.cashTransaction.create({
        data: { companyId, locationId: s.locationId, cashboxId, userId: s.userId, saleId: sale.id, amount: total - bonusPay, method: s.method, category: "Продажа", comment: `Продажа №${number}${bonusPay ? `, баллами ${(bonusPay / 100).toLocaleString("ru-RU")} ₽` : ""}` },
      });
    await logAction(tx, {
      companyId,
      userId: s.userId,
      locationId: s.locationId,
      cashboxId,
      kind: "sale",
      text: `Продажа №${number}, склад «${wh.name}», ${PAY_LABEL[s.method].toLowerCase()}${discount ? `, скидка ${(discount / 100).toLocaleString("ru-RU")} ₽` : ""}`,
      amount: total,
      link: `/sales/${sale.id}`,
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
  r: { saleId: string; userId: string; method: PayMethod; cashboxId?: string | null; items: { saleItemId: string; qty: number }[]; reason?: string },
) {
  const want = r.items.filter((i) => i.qty > 0);
  if (!want.length) throw new Error("Отметьте, что возвращаете");
  return db.$transaction(async (tx) => {
    const sale = await tx.sale.findUniqueOrThrow({ where: { id: r.saleId }, include: { items: true, transactions: { take: 1 } } });
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
    const warehouseId = await resolveWarehouse(tx, sale.locationId, sale.warehouseId);
    const cashboxId = await resolveCashbox(tx, sale.locationId, r.cashboxId || sale.transactions[0]?.cashboxId);
    const number = await nextSaleNumber(companyId);
    // часть, оплаченная баллами, возвращается баллами; начисленные за покупку баллы отменяются пропорционально
    const share = sale.total > 0 ? total / sale.total : 0;
    const bonusBack = Math.min(Math.round(sale.bonusPaid * share), total);
    const ret = await tx.sale.create({
      data: { companyId, locationId: sale.locationId, warehouseId, number, clientId: sale.clientId, userId: r.userId, total: -total, isReturn: true, returnOfId: sale.id, bonusPaid: bonusBack },
    });
    if (sale.clientId) {
      const accrued = (await tx.bonusTx.aggregate({ where: { saleId: sale.id, kind: "ACCRUE" }, _sum: { amount: true } }))._sum.amount ?? 0;
      const cancel = Math.round(accrued * share);
      if (cancel > 0) await tx.bonusTx.create({ data: { companyId, clientId: sale.clientId, kind: "RETURN", amount: -cancel, saleId: ret.id, userId: r.userId, comment: `Отмена начисления, возврат №${number}` } });
      if (bonusBack > 0) await tx.bonusTx.create({ data: { companyId, clientId: sale.clientId, kind: "RETURN", amount: bonusBack, saleId: ret.id, userId: r.userId, comment: `Баллы вернулись, возврат №${number}` } });
    }
    for (const x of rows) {
      await tx.saleItem.create({ data: { companyId, saleId: ret.id, ...x } });
      await moveStockTx(tx, { productId: x.productId, warehouseId, qty: x.qty, type: "RETURN", userId: r.userId, comment: `Возврат по продаже №${sale.number}`, link: `/sales/${ret.id}` });
    }
    if (total - bonusBack > 0)
      await tx.cashTransaction.create({
        data: {
          companyId,
          locationId: sale.locationId,
          cashboxId,
          userId: r.userId,
          saleId: ret.id,
          amount: -(total - bonusBack),
          method: r.method,
          category: "Возврат продажи",
          comment: `Возврат №${number} по продаже №${sale.number}${r.reason ? `: ${r.reason}` : ""}`,
        },
      });
    await logAction(tx, {
      companyId,
      userId: r.userId,
      locationId: sale.locationId,
      cashboxId,
      kind: "sale",
      text: `Возврат №${number} по продаже №${sale.number}${r.reason ? `: ${r.reason}` : ""}`,
      amount: -total,
      link: `/sales/${ret.id}`,
    });
    return ret;
  });
}

// ---------- Кассовая смена ----------
// Смена открывается на кассу. Если касса не указана — касса точки по умолчанию.

type ShiftPlace = { locationId: string; cashboxId?: string | null };

async function shiftCashbox({ db }: Tenant, p: ShiftPlace) {
  return p.cashboxId ? (await db.cashbox.findUniqueOrThrow({ where: { id: p.cashboxId } })).id : defaultCashboxId(db, p.locationId);
}

export async function currentShift(t: Tenant, p: ShiftPlace | string) {
  const place = typeof p === "string" ? { locationId: p } : p;
  const cashboxId = await shiftCashbox(t, place);
  return t.db.cashShift.findFirst({ where: { cashboxId, closedAt: null }, orderBy: { openedAt: "desc" } });
}

/** Наличные в кассе по учёту (все операции наличными). */
export async function cashOnHand(t: Tenant, p: ShiftPlace | string) {
  const place = typeof p === "string" ? { locationId: p } : p;
  const cashboxId = await shiftCashbox(t, place);
  const a = await t.db.cashTransaction.aggregate({ where: { cashboxId, method: "CASH" }, _sum: { amount: true } });
  return a._sum.amount ?? 0;
}

export async function openShift(t: Tenant, s: ShiftPlace & { userId: string }) {
  const cashboxId = await shiftCashbox(t, s);
  if (await currentShift(t, { ...s, cashboxId })) throw new Error("Смена уже открыта");
  const openCash = await cashOnHand(t, { ...s, cashboxId });
  const shift = await t.db.cashShift.create({ data: { companyId: t.companyId, locationId: s.locationId, cashboxId, openedById: s.userId, openCash } });
  await logAction(t.db, { companyId: t.companyId, userId: s.userId, locationId: s.locationId, cashboxId, kind: "cash", text: "Открыта смена", amount: openCash });
  return shift;
}

/** Итоги смены: продажи, возвраты, оплаты заказов, расходы по способам оплаты. */
export async function shiftSummary({ db }: Tenant, where: { locationId?: string; cashboxId?: string } | string, from: Date, to: Date) {
  const w = typeof where === "string" ? { locationId: where } : where;
  const tx = await db.cashTransaction.findMany({ where: { ...w, createdAt: { gte: from, lt: to } } });
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

export async function closeShift(t: Tenant, s: ShiftPlace & { userId: string; closeCash: number; comment?: string | null }) {
  const cashboxId = await shiftCashbox(t, s);
  const shift = await currentShift(t, { ...s, cashboxId });
  if (!shift) throw new Error("Смена не открыта");
  const expectedCash = await cashOnHand(t, { ...s, cashboxId });
  const diff = s.closeCash - expectedCash;
  if (diff !== 0) {
    // расхождение фиксируем отдельной операцией, чтобы остаток в кассе совпал с фактом
    await t.db.cashTransaction.create({
      data: {
        companyId: t.companyId,
        locationId: s.locationId,
        cashboxId,
        userId: s.userId,
        amount: diff,
        method: "CASH",
        category: diff > 0 ? "Излишек при закрытии смены" : "Недостача при закрытии смены",
        comment: s.comment || null,
      },
    });
  }
  await logAction(t.db, {
    companyId: t.companyId,
    userId: s.userId,
    locationId: s.locationId,
    cashboxId,
    kind: "cash",
    text: `Закрыта смена${diff ? (diff > 0 ? `, излишек ${(diff / 100).toLocaleString("ru-RU")} ₽` : `, недостача ${(-diff / 100).toLocaleString("ru-RU")} ₽`) : ""}`,
    amount: s.closeCash,
  });
  return t.db.cashShift.update({
    where: { id: shift.id },
    data: { closedAt: new Date(), closedById: s.userId, expectedCash, closeCash: s.closeCash, comment: s.comment || null },
  });
}
