import type { PayMethod, StatusKind } from "@prisma/client";
import { prisma, type Tenant } from "../db";
import { defaultCashboxId } from "./places";
import { normalizePhone } from "./orders";

/**
 * Перенос истории из старой CRM (LiveSklad): заказы и продажи с их настоящими датами.
 * Формат — JSON, который готовит Claude из данных LiveSklad. Суммы в рублях, даты в ISO с часовым поясом.
 * Остатки на складе не меняются: это прошлые операции, текущие остатки загружаются отдельно.
 * Повторная загрузка безопасна: заказ или продажа с уже существующим номером пропускается.
 */
export type HistItem = { kind: "SERVICE" | "PART"; name: string; qty: number; price: number; cost?: number; warrantyDays?: number | null };
/** cashbox — название кассы LiveSklad («Касса», «Ремонт»…); такая касса находится по названию или создаётся */
export type HistPayment = { at: string; amount: number; method: string; cashbox?: string | null };
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
  payments: { amount: number; method: string; at?: string | null }[];
  /** касса, в которую пришли деньги по чеку */
  cashbox?: string | null;
  /** возврат по этому чеку (в LiveSklad он хранится внутри чека); оформляется отдельной продажей-возвратом с номером 1 000 000 + номер чека */
  returned?: { items: { name: string; qty: number; price: number }[]; amount: number; method: string; at?: string | null; cashbox?: string | null } | null;
};
/** прочие движения денег: расходы, зарплата, оплата поставщикам, внесения, перемещения между кассами */
export type HistCash = {
  at: string;
  amount: number;
  method: string;
  category: string;
  comment?: string | null;
  cashbox?: string | null;
  /** две половины перемещения между кассами с одинаковым ключом связываются в один перевод */
  transferKey?: string | null;
  /** получатель: поставщик (находится по названию или создаётся) или сотрудник */
  supplier?: string | null;
  recipient?: string | null;
};
/** операция, удалённая в LiveSklad: в CRM помечается удалённой (сумма обнуляется, исходная сохраняется) */
export type HistDeleted = { at: string; amount: number };
export type HistoryData = { orders?: HistOrder[]; sales?: HistSale[]; cash?: HistCash[]; deleted?: HistDeleted[] };
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
  cash: number;
  cashSum: number;
  skippedCash: number;
  /** у уже перенесённых операций исправлена касса */
  relinked: number;
  deleted: number;
  cashboxes: string[];
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

/** Сотрудник по имени: «Голин Рихард» найдёт «Рихард Голин», «Голин Р.» и «Рихард». */
function userMatcher(users: { id: string; name: string }[]) {
  const words = (s: string) => s.toLowerCase().replace(/ё/g, "е").split(/[\s.]+/).filter((w) => w.length > 1);
  return (name: string | null | undefined) => {
    if (!name) return null;
    const want = words(name);
    const hit = users.find((u) => {
      const have = words(u.name);
      const same = (w: string, h: string) => h === w || h.startsWith(w) || w.startsWith(h);
      // «Голин Рихард» найдёт и сотрудника, записанного одним именем «Рихард»
      return want.length > 0 && have.length > 0 && (want.every((w) => have.some((h) => same(w, h))) || have.every((h) => want.some((w) => same(w, h))));
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
  const rep: HistoryReport = { orders: 0, sales: 0, skippedOrders: [], skippedSales: [], clients: 0, products: 0, orderPaid: 0, salesPaid: 0, returns: 0, cash: 0, cashSum: 0, skippedCash: 0, relinked: 0, deleted: 0, cashboxes: [], errors: [] };
  const users = await db.user.findMany({ select: { id: true, name: true } });
  const userId = userMatcher(users);
  const defaultBox = await defaultCashboxId(db, o.locationId);
  const boxes = new Map((await db.cashbox.findMany({ select: { id: true, name: true } })).map((b) => [b.name.trim().toLowerCase(), b.id]));
  /** касса по названию из LiveSklad; новой кассы нет — создаётся (при проверке только считается) */
  async function boxId(name: string | null | undefined) {
    const n = name?.trim();
    if (!n) return defaultBox;
    const have = boxes.get(n.toLowerCase());
    if (have) return have;
    rep.cashboxes.push(n);
    if (o.dryRun) {
      boxes.set(n.toLowerCase(), defaultBox);
      return defaultBox;
    }
    const b = await db.cashbox.create({ data: { companyId, locationId: o.locationId, name: n.slice(0, 100) } });
    boxes.set(n.toLowerCase(), b.id);
    return b.id;
  }
  /** перенести уже существующие операции в нужную кассу */
  async function relink(ids: string[], cashboxId: string) {
    if (!ids.length) return;
    const r = await db.cashTransaction.updateMany({ where: { id: { in: ids }, cashboxId: { not: cashboxId } }, data: { cashboxId } });
    rep.relinked += r.count;
  }
  const statuses = await db.orderStatus.findMany({ orderBy: { sort: "asc" } });
  const statusFor = (k: StatusKind) => statuses.find((s) => s.kind === k)?.id;
  const orderIds = new Map((await db.order.findMany({ select: { id: true, number: true } })).map((x) => [x.number, x.id]));
  const haveOrders = new Set(orderIds.keys());
  const saleIds = new Map((await db.sale.findMany({ select: { id: true, number: true } })).map((x) => [x.number, x.id]));
  const haveSales = new Set([...saleIds.keys()].filter((n) => n < RETURN_BASE));
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
      // заказ уже перенесён: разнести его оплаты по кассам
      if (o.dryRun) for (const p of h.payments) await boxId(p.cashbox);
      else if (h.payments.some((p) => p.cashbox)) {
        const txs = await db.cashTransaction.findMany({ where: { orderId: orderIds.get(h.number)! }, select: { id: true, amount: true, createdAt: true } });
        for (const p of h.payments) {
          if (!p.cashbox) continue;
          const at = date(p.at)?.getTime();
          const hit = txs.filter((x) => x.amount === kop(p.amount) && (at == null || x.createdAt.getTime() === at)).map((x) => x.id);
          await relink(hit, await boxId(p.cashbox));
        }
      }
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
      const payBoxes: string[] = [];
      for (const p of h.payments) payBoxes.push(await boxId(p.cashbox));
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
        for (const [pi, p] of h.payments.entries()) {
          const amount = kop(p.amount);
          if (!amount) continue;
          await tx.cashTransaction.create({
            data: {
              companyId,
              locationId: o.locationId,
              cashboxId: payBoxes[pi],
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
      // чек уже перенесён: оплаты и возврат — в кассу чека
      if (o.dryRun) await boxId(s.cashbox);
      else if (s.cashbox) {
        const box = await boxId(s.cashbox);
        const own = await db.cashTransaction.findMany({ where: { saleId: saleIds.get(s.number)! }, select: { id: true, amount: true, createdAt: true } });
        await relink(own.map((x) => x.id), box);
        // оплаты по частям в разные дни: вернуть каждой её дату
        const left = [...own];
        for (const p of s.payments) {
          const at = date(p.at ?? null);
          const i = left.findIndex((x) => x.amount === kop(p.amount));
          if (i < 0) continue;
          const [x] = left.splice(i, 1);
          if (at && x.createdAt.getTime() !== at.getTime()) {
            await db.cashTransaction.update({ where: { id: x.id }, data: { createdAt: at } });
            rep.relinked++;
          }
        }
        const retId = saleIds.get(RETURN_BASE + s.number);
        if (retId) {
          const ret = await db.cashTransaction.findMany({ where: { saleId: retId }, select: { id: true } });
          await relink(ret.map((x) => x.id), s.returned?.cashbox ? await boxId(s.returned.cashbox) : box);
        }
      }
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
      const saleBox = await boxId(s.cashbox);
      const retBox = s.returned?.cashbox ? await boxId(s.returned.cashbox) : saleBox;
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
              cashboxId: saleBox,
              userId: seller ?? o.userId,
              saleId: sale.id,
              amount,
              method: payMethod(p.method),
              category: amount < 0 ? "Возврат продажи" : "Продажа",
              comment: [`Продажа №${s.number} (перенос из LiveSklad)`, !seller && s.user ? `кассир ${s.user}` : null, s.comment].filter(Boolean).join(", "),
              createdAt: date(p.at) ?? createdAt,
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
              cashboxId: retBox,
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

  // прочие движения денег; повтор узнаётся по дате, сумме и статье
  if (data.cash?.length) {
    const old = await db.cashTransaction.findMany({
      where: { orderId: null, saleId: null },
      select: { id: true, createdAt: true, amount: true, origAmount: true, deletedAt: true, category: true, transferId: true, cashboxId: true, supplierId: true, recipientId: true },
    });
    // уже перенесённые: ключ — дата, сумма и статья (у удалённых — исходная сумма)
    const seen = new Map<string, typeof old>();
    for (const x of old) {
      const k = `${x.createdAt.getTime()}|${x.deletedAt ? (x.origAmount ?? 0) : x.amount}|${x.category}`;
      seen.set(k, [...(seen.get(k) ?? []), x]);
    }
    const used = new Set<string>();
    const transfers = new Map<string, string>();
    const suppliers = new Map((await db.supplier.findMany({ select: { id: true, name: true } })).map((x) => [x.name.trim().toLowerCase(), x.id]));
    async function supplierId(name: string | null | undefined) {
      const n = name?.trim();
      if (!n || o.dryRun) return null;
      const have = suppliers.get(n.toLowerCase());
      if (have) return have;
      const s = await db.supplier.create({ data: { companyId, name: n.slice(0, 200) } });
      suppliers.set(n.toLowerCase(), s.id);
      return s.id;
    }
    for (const c of data.cash) {
      const at = date(c.at);
      const amount = kop(c.amount);
      if (!at || !amount) continue;
      const category = (c.category || "Прочее").slice(0, 100);
      const key = `${at.getTime()}|${amount}|${category}`;
      const twin = (seen.get(key) ?? []).find((x) => !used.has(x.id));
      if (twin) {
        used.add(twin.id);
        rep.skippedCash++;
        if (o.dryRun) await boxId(c.cashbox);
        else if (c.cashbox || c.transferKey || c.supplier || c.recipient) {
          const data: { cashboxId?: string; transferId?: string; supplierId?: string; recipientId?: string } = {};
          if (c.supplier && !twin.supplierId) data.supplierId = (await supplierId(c.supplier)) ?? undefined;
          if (c.recipient && !twin.recipientId) data.recipientId = userId(c.recipient) ?? undefined;
          for (const k of ["supplierId", "recipientId"] as const) if (!data[k]) delete data[k];
          const box = await boxId(c.cashbox);
          if (c.cashbox && twin.cashboxId !== box) data.cashboxId = box;
          if (c.transferKey && !twin.transferId) data.transferId = transfers.get(c.transferKey) ?? crypto.randomUUID();
          if (data.transferId) transfers.set(c.transferKey!, data.transferId);
          if (Object.keys(data).length) {
            await db.cashTransaction.update({ where: { id: twin.id }, data });
            rep.relinked++;
          }
        }
        continue;
      }
      rep.cash++;
      rep.cashSum += amount;
      if (o.dryRun) {
        await boxId(c.cashbox);
        continue;
      }
      let transferId: string | null = null;
      if (c.transferKey) {
        transferId = transfers.get(c.transferKey) ?? crypto.randomUUID();
        transfers.set(c.transferKey, transferId);
      }
      await db.cashTransaction.create({
        data: {
          companyId,
          locationId: o.locationId,
          cashboxId: await boxId(c.cashbox),
          userId: o.userId,
          amount,
          method: payMethod(c.method),
          category,
          comment: c.comment?.slice(0, 500) || "Перенос из LiveSklad",
          createdAt: at,
          transferId,
          supplierId: await supplierId(c.supplier),
          recipientId: userId(c.recipient),
        },
      });
    }
  }

  // удалённые в LiveSklad операции: в CRM помечаются удалёнными, как при удалении вручную
  for (const d of data.deleted ?? []) {
    const at = date(d.at);
    const amount = kop(d.amount);
    if (!at || !amount) continue;
    const hit = await db.cashTransaction.findFirst({ where: { createdAt: at, amount, deletedAt: null } });
    if (!hit) continue;
    rep.deleted++;
    if (!o.dryRun) await db.cashTransaction.update({ where: { id: hit.id }, data: { deletedAt: new Date(), origAmount: hit.amount, amount: 0 } });
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
