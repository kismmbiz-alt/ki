import type { PayMethod, StatusKind } from "@prisma/client";
import { prisma, type Tenant } from "../db";
import { normalizePhone } from "./orders";

/**
 * Перенос истории из старой CRM (LiveSklad): заказы и продажи с их настоящими датами.
 * Формат — JSON, который готовит Claude из данных LiveSklad. Суммы в рублях, даты в ISO с часовым поясом.
 * Остатки на складе не меняются: это прошлые операции, текущие остатки загружаются отдельно.
 * Повторная загрузка безопасна: заказ или продажа с уже существующим номером пропускается.
 */
export type HistItem = { kind: "SERVICE" | "PART"; name: string; qty: number; price: number; cost?: number; warrantyDays?: number | null };
export type HistPayment = { at: string; amount: number; method: string };
export type HistOrder = {
  number: number;
  createdAt: string;
  status: StatusKind;
  orderType?: string | null;
  client: { name: string; phone: string };
  source?: string | null;
  deviceType: string;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  equipment?: string | null;
  appearance?: string | null;
  problem: string;
  notes?: string | null;
  verdict?: string | null;
  estimatedPrice?: number | null;
  dueDate?: string | null;
  master?: string | null;
  manager?: string | null;
  closedAt?: string | null;
  items: HistItem[];
  payments: HistPayment[];
  events: { at: string; text: string }[];
};
export type HistSale = {
  number: number;
  createdAt: string;
  user?: string | null;
  client?: { name?: string | null; phone?: string | null } | null;
  discount?: number;
  profit?: number | null;
  comment?: string | null;
  items: { name: string; sku?: string | null; qty: number; price: number }[];
  payments: { amount: number; method: string }[];
  /** возврат по этому чеку (в LiveSklad он хранится внутри чека); оформляется отдельной продажей-возвратом с номером 1 000 000 + номер чека */
  returned?: { items: { name: string; qty: number; price: number }[]; amount: number; method: string; at?: string | null } | null;
};
export type HistoryData = { orders?: HistOrder[]; sales?: HistSale[] };
export type HistoryReport = {
  orders: number;
  sales: number;
  skippedOrders: number[];
  skippedSales: number[];
  clients: number;
  products: number;
  orderPaid: number;
  salesPaid: number;
  returns: number;
  errors: string[];
};

const RETURN_BASE = 1_000_000;
const kop = (rub: number | null | undefined) => (rub == null || !Number.isFinite(rub) ? 0 : Math.round(rub * 100));
const date = (s: string | null | undefined) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function payMethod(s: string): PayMethod {
  const v = s.toLowerCase();
  if (/нал(?!ом)|наличн|cash/.test(v) && !/безнал/.test(v)) return "CASH";
  if (/перевод|сбп|transfer/.test(v)) return "TRANSFER";
  return "CARD";
}

/** Сотрудник по имени: «Голин Рихард» найдёт «Рихард Голин» и «Голин Р.». */
function userMatcher(users: { id: string; name: string }[]) {
  const words = (s: string) => s.toLowerCase().replace(/ё/g, "е").split(/[\s.]+/).filter((w) => w.length > 1);
  return (name: string | null | undefined) => {
    if (!name) return null;
    const want = words(name);
    const hit = users.find((u) => {
      const have = words(u.name);
      return want.length > 0 && want.every((w) => have.some((h) => h === w || h.startsWith(w) || w.startsWith(h)));
    });
    return hit?.id ?? null;
  };
}

function check(data: HistoryData) {
  if (!data || typeof data !== "object") throw new Error("Пустые данные");
  for (const o of data.orders ?? []) {
    if (!Number.isInteger(o.number) || o.number <= 0) throw new Error(`Заказ без номера: ${JSON.stringify(o).slice(0, 80)}`);
    if (!date(o.createdAt)) throw new Error(`Заказ №${o.number}: нет даты`);
    if (!o.client?.phone) throw new Error(`Заказ №${o.number}: нет телефона клиента`);
  }
  for (const s of data.sales ?? []) {
    if (!Number.isInteger(s.number) || s.number <= 0) throw new Error(`Продажа без номера`);
    if (!date(s.createdAt)) throw new Error(`Продажа №${s.number}: нет даты`);
  }
}

export async function importHistory(t: Tenant, data: HistoryData, o: { locationId: string; userId: string; dryRun: boolean }): Promise<HistoryReport> {
  check(data);
  const { db, companyId } = t;
  const rep: HistoryReport = { orders: 0, sales: 0, skippedOrders: [], skippedSales: [], clients: 0, products: 0, orderPaid: 0, salesPaid: 0, returns: 0, errors: [] };
  const users = await db.user.findMany({ select: { id: true, name: true } });
  const userId = userMatcher(users);
  const statuses = await db.orderStatus.findMany({ orderBy: { sort: "asc" } });
  const statusFor = (k: StatusKind) => statuses.find((s) => s.kind === k)?.id;
  const haveOrders = new Set((await db.order.findMany({ select: { number: true } })).map((x) => x.number));
  const haveSales = new Set((await db.sale.findMany({ where: { isReturn: false }, select: { number: true } })).map((x) => x.number));
  const sources = new Map((await db.adSource.findMany()).map((s) => [s.name.toLowerCase(), s.id]));
  const clients = new Map((await db.client.findMany({ select: { id: true, phone: true } })).map((c) => [c.phone, c.id]));

  async function clientId(name: string | null | undefined, phoneRaw: string | null | undefined, source?: string | null) {
    const phone = normalizePhone(phoneRaw ?? "");
    if (phone.length < 8) return null;
    const have = clients.get(phone);
    if (have) return have;
    if (o.dryRun) {
      clients.set(phone, "dry");
      rep.clients++;
      return "dry";
    }
    let adSourceId: string | null = null;
    if (source) {
      adSourceId = sources.get(source.toLowerCase()) ?? null;
      if (!adSourceId) {
        adSourceId = (await db.adSource.create({ data: { companyId, name: source.slice(0, 100) } })).id;
        sources.set(source.toLowerCase(), adSourceId);
      }
    }
    const c = await db.client.create({ data: { companyId, name: name?.trim() || "Без имени", phone, adSourceId } });
    clients.set(phone, c.id);
    rep.clients++;
    return c.id;
  }

  for (const h of data.orders ?? []) {
    if (haveOrders.has(h.number)) {
      rep.skippedOrders.push(h.number);
      continue;
    }
    const statusId = statusFor(h.status) ?? statusFor("NEW");
    if (!statusId) throw new Error("Не настроены статусы заказов");
    const paid = h.payments.reduce((s, p) => s + kop(p.amount), 0);
    rep.orderPaid += paid;
    rep.orders++;
    if (o.dryRun) {
      await clientId(h.client.name, h.client.phone, h.source);
      continue;
    }
    try {
      const cid = await clientId(h.client.name, h.client.phone, h.source);
      if (!cid) throw new Error("неверный телефон клиента");
      const createdAt = date(h.createdAt)!;
      const masterId = userId(h.master);
      const managerId = userId(h.manager);
      const notes = [h.notes, !masterId && h.master ? `Мастер в LiveSklad: ${h.master}` : null, !managerId && h.manager ? `Менеджер в LiveSklad: ${h.manager}` : null]
        .filter(Boolean)
        .join("\n");
      await db.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            companyId,
            locationId: o.locationId,
            number: h.number,
            clientId: cid,
            statusId,
            masterId,
            managerId,
            authorId: o.userId,
            orderType: h.orderType || "Платный",
            color: h.color || null,
            verdict: h.verdict || null,
            deviceType: h.deviceType || "Телефон",
            brand: h.brand || null,
            model: h.model || null,
            problem: h.problem || "—",
            equipment: h.equipment || null,
            appearance: h.appearance || null,
            notes: notes || null,
            estimatedPrice: h.estimatedPrice ? kop(h.estimatedPrice) : null,
            dueDate: date(h.dueDate),
            publicToken: crypto.randomUUID().replace(/-/g, ""),
            closedAt: h.status === "CLOSED" || h.status === "CANCELED" ? (date(h.closedAt) ?? createdAt) : null,
            createdAt,
          },
        });
        for (const it of h.items) {
          await tx.orderItem.create({
            data: {
              companyId,
              orderId: order.id,
              kind: it.kind,
              name: it.name.slice(0, 300),
              qty: Math.max(1, Math.round(it.qty || 1)),
              price: kop(it.price),
              cost: kop(it.cost ?? (it.kind === "PART" ? it.price : 0)),
              warrantyDays: it.warrantyDays ?? null,
              createdAt,
            },
          });
        }
        for (const p of h.payments) {
          const amount = kop(p.amount);
          if (!amount) continue;
          await tx.cashTransaction.create({
            data: {
              companyId,
              locationId: o.locationId,
              userId: o.userId,
              orderId: order.id,
              amount,
              method: payMethod(p.method),
              category: amount < 0 ? "Возврат по заказу" : "Оплата заказа",
              comment: `Заказ №${h.number} (перенос из LiveSklad)`,
              createdAt: date(p.at) ?? createdAt,
            },
          });
        }
        const events = [{ at: h.createdAt, text: "Заказ перенесён из LiveSklad" }, ...h.events];
        for (const e of events) {
          await tx.orderEvent.create({ data: { companyId, orderId: order.id, text: e.text.slice(0, 1000), createdAt: date(e.at) ?? createdAt } });
        }
      });
    } catch (e) {
      rep.orders--;
      rep.orderPaid -= paid;
      rep.errors.push(`Заказ №${h.number}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // товары для продаж: по коду, потом по названию; недостающие создаются без остатка
  const products = await db.product.findMany({ select: { id: true, name: true, sku: true } });
  const bySku = new Map(products.filter((p) => p.sku).map((p) => [p.sku!.toLowerCase(), p.id]));
  const byName = new Map(products.map((p) => [p.name.toLowerCase(), p.id]));
  async function productId(name: string, sku: string | null | undefined, price: number) {
    const id = (sku && bySku.get(sku.toLowerCase())) || byName.get(name.toLowerCase());
    if (id) return id;
    rep.products++;
    if (o.dryRun) {
      byName.set(name.toLowerCase(), "dry");
      return "dry";
    }
    const p = await db.product.create({ data: { companyId, name: name.slice(0, 300), sku: sku || null, price: kop(price) } });
    byName.set(name.toLowerCase(), p.id);
    if (sku) bySku.set(sku.toLowerCase(), p.id);
    return p.id;
  }

  for (const s of data.sales ?? []) {
    if (haveSales.has(s.number)) {
      rep.skippedSales.push(s.number);
      continue;
    }
    const sub = s.items.reduce((a, i) => a + kop(i.price) * i.qty, 0);
    const discount = Math.min(kop(s.discount), sub);
    const total = sub - discount;
    const refund = s.returned ? kop(s.returned.amount) : 0;
    const paid = s.payments.reduce((a, p) => a + kop(p.amount), 0) - refund;
    rep.sales++;
    rep.salesPaid += paid;
    if (s.returned) rep.returns++;
    if (o.dryRun) {
      for (const i of s.items) await productId(i.name, i.sku, i.price);
      if (s.client?.phone) await clientId(s.client.name, s.client.phone);
      continue;
    }
    try {
      const createdAt = date(s.createdAt)!;
      const cid = s.client?.phone ? await clientId(s.client.name, s.client.phone) : null;
      const ids: string[] = [];
      for (const i of s.items) ids.push(await productId(i.name, i.sku, i.price));
      // себестоимость: из валовой прибыли чека, по позициям пропорционально цене
      const costTotal = s.profit != null && sub > 0 ? Math.max(0, total - kop(s.profit)) : 0;
      const seller = userId(s.user);
      await db.$transaction(async (tx) => {
        const sale = await tx.sale.create({
          data: { companyId, locationId: o.locationId, number: s.number, clientId: cid, userId: seller ?? o.userId, total, discount, createdAt },
        });
        const costs: number[] = [];
        for (const [n, i] of s.items.entries()) {
          const line = kop(i.price) * i.qty;
          costs[n] = sub > 0 && i.qty > 0 ? Math.round((costTotal * line) / sub / i.qty) : 0;
          await tx.saleItem.create({
            data: {
              companyId,
              saleId: sale.id,
              productId: ids[n],
              name: i.name.slice(0, 300),
              qty: Math.max(1, Math.round(i.qty)),
              price: kop(i.price),
              cost: costs[n],
            },
          });
        }
        for (const p of s.payments) {
          const amount = kop(p.amount);
          if (!amount) continue;
          await tx.cashTransaction.create({
            data: {
              companyId,
              locationId: o.locationId,
              userId: seller ?? o.userId,
              saleId: sale.id,
              amount,
              method: payMethod(p.method),
              category: amount < 0 ? "Возврат продажи" : "Продажа",
              comment: [`Продажа №${s.number} (перенос из LiveSklad)`, !seller && s.user ? `кассир ${s.user}` : null, s.comment].filter(Boolean).join(", "),
              createdAt,
            },
          });
        }
        if (s.returned && refund > 0) {
          const retAt = date(s.returned.at) ?? createdAt;
          const ret = await tx.sale.create({
            data: { companyId, locationId: o.locationId, number: RETURN_BASE + s.number, clientId: cid, userId: seller ?? o.userId, total: -refund, isReturn: true, returnOfId: sale.id, createdAt: retAt },
          });
          for (const i of s.returned.items) {
            const n = s.items.findIndex((x) => x.name === i.name);
            await tx.saleItem.create({
              data: { companyId, saleId: ret.id, productId: ids[n >= 0 ? n : 0], name: i.name.slice(0, 300), qty: Math.max(1, Math.round(i.qty)), price: kop(i.price), cost: costs[n >= 0 ? n : 0] ?? 0 },
            });
          }
          await tx.cashTransaction.create({
            data: {
              companyId,
              locationId: o.locationId,
              userId: seller ?? o.userId,
              saleId: ret.id,
              amount: -refund,
              method: payMethod(s.returned.method),
              category: "Возврат продажи",
              comment: `Возврат по продаже №${s.number} (перенос из LiveSklad)`,
              createdAt: retAt,
            },
          });
        }
      });
    } catch (e) {
      rep.sales--;
      if (s.returned) rep.returns--;
      rep.salesPaid -= paid;
      rep.errors.push(`Продажа №${s.number}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!o.dryRun) {
    // новые номера продолжают перенесённые
    const maxOrder = Math.max(0, ...(data.orders ?? []).map((x) => x.number));
    const maxSale = Math.max(0, ...(data.sales ?? []).map((x) => x.number).filter((n) => n < RETURN_BASE));
    const c = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { orderSeq: true, saleSeq: true } });
    await prisma.company.update({ where: { id: companyId }, data: { orderSeq: Math.max(c.orderSeq, maxOrder), saleSeq: Math.max(c.saleSeq, maxSale) } });
  }
  return rep;
}
