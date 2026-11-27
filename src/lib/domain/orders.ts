import type { Tx, Tenant } from "../db";
import { prisma } from "../db";
import { newPublicToken } from "./company";

export type NewOrderInput = {
  locationId: string;
  authorId: string;
  client: { id?: string; name?: string; phone?: string; address?: string | null; adSourceId?: string | null };
  orderType?: string | null;
  color?: string | null;
  urgent?: boolean;
  managerId?: string | null;
  deviceType: string;
  brand?: string | null;
  model?: string | null;
  serial?: string | null;
  problem: string;
  equipment?: string | null;
  appearance?: string | null;
  notes?: string | null;
  estimatedPrice?: number | null;
  prepayment?: number;
  prepaymentMethod?: "CASH" | "CARD" | "TRANSFER";
  prepaymentCashboxId?: string | null;
  dueDate?: Date | null;
  masterId?: string | null;
};

async function nextNumber(companyId: string, field: "orderSeq" | "saleSeq") {
  const c = await prisma.company.update({
    where: { id: companyId },
    data: { [field]: { increment: 1 } },
    select: { orderSeq: true, saleSeq: true },
  });
  return c[field];
}

export async function createOrder({ db, companyId }: Tenant, input: NewOrderInput) {
  if (!input.deviceType?.trim()) throw new Error("Укажите тип устройства");
  if (!input.problem?.trim()) throw new Error("Опишите неисправность");

  return db.$transaction(async (tx) => {
    let clientId = input.client.id;
    if (!clientId) {
      const phone = normalizePhone(input.client.phone ?? "");
      if (!phone) throw new Error("Укажите телефон клиента");
      const existing = await tx.client.findFirst({ where: { phone } });
      clientId =
        existing?.id ??
        (
          await tx.client.create({
            data: { companyId,
              name: input.client.name?.trim() || "Без имени",
              phone,
              address: input.client.address || null,
              adSourceId: input.client.adSourceId || null,
            },
          })
        ).id;
    }

    const status = await tx.orderStatus.findFirst({ where: { kind: "NEW" }, orderBy: { sort: "asc" } });
    if (!status) throw new Error("Не настроен начальный статус заказа");
    const number = await nextNumber(companyId, "orderSeq");

    const order = await tx.order.create({
      data: { companyId,
        locationId: input.locationId,
        number,
        clientId,
        statusId: status.id,
        statusAt: new Date(),
        masterId: input.masterId || null,
        managerId: input.managerId || input.authorId,
        authorId: input.authorId,
        orderType: input.orderType?.trim() || "Платный",
        color: input.color || null,
        urgent: !!input.urgent,
        deviceType: input.deviceType.trim(),
        brand: input.brand || null,
        model: input.model || null,
        serial: input.serial || null,
        problem: input.problem.trim(),
        equipment: input.equipment || null,
        appearance: input.appearance || null,
        notes: input.notes || null,
        estimatedPrice: input.estimatedPrice ?? null,
        dueDate: input.dueDate ?? null,
        publicToken: newPublicToken(),
      },
    });
    await tx.orderEvent.create({
      data: { companyId, orderId: order.id, userId: input.authorId, text: `Заказ принят, статус «${status.name}»` },
    });
    await learnTx(tx, {
      DEVICE_TYPE: input.deviceType,
      BRAND: input.brand,
      MODEL: input.model,
      COLOR: input.color,
      DEFECT: input.problem,
      EQUIPMENT: input.equipment,
      APPEARANCE: input.appearance,
    });
    await logAction(tx, { companyId, userId: input.authorId, locationId: input.locationId, kind: "order", text: `Принят заказ №${order.number}`, link: `/orders/${order.id}` });
    if (input.prepayment && input.prepayment > 0) {
      await addPaymentTx(tx, {
        orderId: order.id,
        locationId: input.locationId,
        userId: input.authorId,
        amount: input.prepayment,
        method: input.prepaymentMethod ?? "CASH",
        cashboxId: input.prepaymentCashboxId,
        prepayment: true,
      });
    }
    return order;
  });
}

export function normalizePhone(p: string) {
  const digits = p.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 11 && (digits.startsWith("8") || digits.startsWith("7"))) return "+7" + digits.slice(1);
  if (digits.length === 10) return "+7" + digits;
  return "+" + digits;
}

/** Кто меняет статус: должность (для прав по статусам) и включены ли цепочки. */
export type StatusActor = { positionId?: string | null; owner?: boolean; chains?: boolean };

/** Проверка правил статусов: права должности, цепочка, оплата, мастер. Возвращает текст ошибки или null. */
export function statusRuleError(
  from: { name: string; nextIds: string[]; denyEdit: string[] },
  to: { id: string; name: string; denySet: string[]; requirePayment: boolean; requireMaster: boolean; kind: string },
  ctx: { actor?: StatusActor; due: number; hasMaster: boolean },
): string | null {
  const pos = ctx.actor?.owner ? null : (ctx.actor?.positionId ?? null);
  if (pos && from.denyEdit.includes(pos)) return `Вашей должности нельзя менять заказы в статусе «${from.name}»`;
  if (pos && to.denySet.includes(pos)) return `Вашей должности нельзя ставить статус «${to.name}»`;
  if (ctx.actor?.chains && from.nextIds.length && !from.nextIds.includes(to.id)) return `Из статуса «${from.name}» нельзя перевести в «${to.name}» — так настроена цепочка статусов`;
  if ((to.requirePayment || to.kind === "CLOSED") && ctx.due > 0) return `Нельзя перевести в «${to.name}»: клиент должен ещё ${(ctx.due / 100).toLocaleString("ru-RU")} ₽`;
  if (to.requireMaster && !ctx.hasMaster) return `Чтобы перевести в «${to.name}», назначьте мастера`;
  return null;
}

export async function changeStatus({ db, companyId }: Tenant, orderId: string, statusId: string, userId: string, actor?: StatusActor) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { status: true } });
    const status = await tx.orderStatus.findUniqueOrThrow({ where: { id: statusId } });
    if (order.statusId === statusId) return order;
    const closing = status.kind === "CLOSED" || status.kind === "CANCELED";
    const t = await orderTotalsTx(tx, orderId);
    const err = statusRuleError(order.status, status, { actor, due: t.due, hasMaster: !!order.masterId });
    if (err) throw new Error(err);
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { statusId, statusAt: new Date(), closedAt: closing ? new Date() : null },
    });
    await tx.orderEvent.create({
      data: { companyId, orderId, userId, text: `Статус: «${order.status.name}» → «${status.name}»` },
    });
    await logAction(tx, { companyId, userId, locationId: order.locationId, kind: "order", text: `Заказ №${order.number}: «${order.status.name}» → «${status.name}»`, link: `/orders/${orderId}` });
    return updated;
  });
}

export async function assignMaster({ db, companyId }: Tenant, orderId: string, masterId: string | null, userId: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { master: true } });
    const master = masterId ? await tx.user.findUniqueOrThrow({ where: { id: masterId } }) : null;
    await tx.order.update({ where: { id: orderId }, data: { masterId: master?.id ?? null } });
    const text = `Мастер: ${order.master?.name ?? "не назначен"} → ${master?.name ?? "не назначен"}`;
    await tx.orderEvent.create({ data: { companyId, orderId, userId, text } });
  });
}

export async function addComment({ db, companyId }: Tenant, orderId: string, userId: string, text: string) {
  if (!text.trim()) return;
  await db.order.findUniqueOrThrow({ where: { id: orderId } });
  await db.orderEvent.create({ data: { companyId, orderId, userId, text: text.trim() } });
}

export async function addService(
  { db, companyId }: Tenant,
  orderId: string,
  userId: string,
  item: { serviceId?: string | null; name?: string; price: number; qty?: number; warrantyDays?: number | null },
) {
  return db.$transaction(async (tx) => {
    await assertOpen(tx, orderId);
    let name = item.name?.trim();
    if (item.serviceId) {
      const s = await tx.service.findUniqueOrThrow({ where: { id: item.serviceId } });
      name = name || s.name;
    }
    if (!name) throw new Error("Укажите название работы");
    await tx.orderItem.create({
      data: { companyId, orderId, kind: "SERVICE", serviceId: item.serviceId || null, name, qty: item.qty ?? 1, price: item.price, warrantyDays: item.warrantyDays ?? null },
    });
    await tx.orderEvent.create({ data: { companyId, orderId, userId, text: `Добавлена работа: ${name}` } });
  });
}

/** Запчасть в заказ: списывается со склада точки, где оформлен заказ. */
export async function addPart(
  { db, companyId }: Tenant,
  orderId: string,
  userId: string,
  item: { productId: string; qty: number; price?: number; warrantyDays?: number | null; warehouseId?: string | null },
) {
  if (item.qty <= 0) throw new Error("Количество должно быть больше нуля");
  return db.$transaction(async (tx) => {
    const order = await assertOpen(tx, orderId);
    const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId }, include: { prices: true } });
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { orderPriceKey: true } });
    const warehouseId = await resolveWarehouse(tx, order.locationId, item.warehouseId);
    await moveStockTx(tx, {
      productId: product.id,
      warehouseId,
      qty: -item.qty,
      type: "ORDER",
      userId,
      comment: `Заказ №${order.number}`,
    });
    await tx.orderItem.create({
      data: { companyId,
        orderId,
        kind: "PART",
        productId: product.id,
        name: product.name,
        qty: item.qty,
        price: item.price ?? priceOf(product, company.orderPriceKey),
        cost: product.cost,
        warrantyDays: item.warrantyDays ?? null,
        warehouseId,
      },
    });
    await tx.orderEvent.create({ data: { companyId, orderId, userId, text: `Установлена запчасть: ${product.name} × ${item.qty}` } });
  });
}

export async function removeItem({ db, companyId }: Tenant, itemId: string, userId: string) {
  return db.$transaction(async (tx) => {
    const item = await tx.orderItem.findUniqueOrThrow({ where: { id: itemId } });
    const order = await assertOpen(tx, item.orderId);
    if (item.kind === "PART" && item.productId) {
      await moveStockTx(tx, {
        productId: item.productId,
        warehouseId: item.warehouseId,
        locationId: order.locationId,
        qty: item.qty,
        type: "RETURN",
        userId,
        comment: `Возврат из заказа №${order.number}`,
      });
    }
    await tx.orderItem.delete({ where: { id: itemId } });
    await tx.orderEvent.create({ data: { companyId, orderId: item.orderId, userId, text: `Удалено: ${item.name}` } });
  });
}

async function assertOpen(tx: Tx, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { status: true } });
  if (order.status.kind === "CLOSED" || order.status.kind === "CANCELED")
    throw new Error("Заказ закрыт, изменения невозможны");
  return order;
}

export async function addPayment(
  { db }: Tenant,
  input: { orderId: string; userId: string; amount: number; method: "CASH" | "CARD" | "TRANSFER"; cashboxId?: string | null; refund?: boolean },
) {
  if (input.amount <= 0) throw new Error("Сумма должна быть больше нуля");
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: input.orderId } });
    await addPaymentTx(tx, {
      orderId: order.id,
      locationId: order.locationId,
      userId: input.userId,
      amount: input.refund ? -input.amount : input.amount,
      method: input.method,
      cashboxId: input.cashboxId,
    });
  });
}

async function addPaymentTx(
  tx: Tx,
  p: { orderId: string; locationId: string; userId: string; amount: number; method: "CASH" | "CARD" | "TRANSFER"; cashboxId?: string | null; prepayment?: boolean },
) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: p.orderId } });
  const companyId = order.companyId;
  const category = p.amount < 0 ? "Возврат по заказу" : p.prepayment ? "Предоплата по заказу" : "Оплата заказа";
  const cashboxId = await resolveCashbox(tx, p.locationId, p.cashboxId);
  const box = await tx.cashbox.findUniqueOrThrow({ where: { id: cashboxId } });
  await logAction(tx, {
    companyId,
    userId: p.userId,
    locationId: p.locationId,
    cashboxId,
    kind: "order",
    text: `${category} №${order.number}, касса «${box.name}»`,
    amount: p.amount,
    link: `/orders/${order.id}`,
  });
  await tx.cashTransaction.create({
    data: { companyId,
      locationId: p.locationId,
      cashboxId,
      userId: p.userId,
      orderId: p.orderId,
      amount: p.amount,
      method: p.method,
      category,
      comment: `Заказ №${order.number}`,
    },
  });
  await tx.orderEvent.create({
    data: { companyId,
      orderId: p.orderId,
      userId: p.userId,
      text: `${category}: ${(Math.abs(p.amount) / 100).toLocaleString("ru-RU")} ₽`,
    },
  });
}

async function orderTotalsTx(tx: Tx, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { discountPct: true, discountSum: true } });
  const items = await tx.orderItem.findMany({ where: { orderId } });
  const paidAgg = await tx.cashTransaction.aggregate({ where: { orderId }, _sum: { amount: true } });
  return totals(items, paidAgg._sum.amount ?? 0, order);
}

/**
 * Выдача заказа: при необходимости принимает остаток оплаты
 * и переводит заказ в первый статус «Выдан».
 */
export async function issueOrder(
  { db, companyId }: Tenant,
  input: { orderId: string; userId: string; method: "CASH" | "CARD" | "TRANSFER"; cashboxId?: string | null; takePayment: boolean },
) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: input.orderId }, include: { status: true } });
    if (order.status.kind === "CLOSED") throw new Error("Заказ уже выдан");
    const closed = await tx.orderStatus.findFirst({ where: { kind: "CLOSED" }, orderBy: { sort: "asc" } });
    if (!closed) throw new Error("Не настроен статус выдачи");
    const t = await orderTotalsTx(tx, order.id);
    if (t.due > 0) {
      if (!input.takePayment) throw new Error(`Клиент должен ещё ${(t.due / 100).toLocaleString("ru-RU")} ₽`);
      await addPaymentTx(tx, { orderId: order.id, locationId: order.locationId, userId: input.userId, amount: t.due, method: input.method, cashboxId: input.cashboxId });
    }
    await tx.order.update({ where: { id: order.id }, data: { statusId: closed.id, statusAt: new Date(), closedAt: new Date() } });
    await logAction(tx, { companyId, userId: input.userId, locationId: order.locationId, kind: "order", text: `Заказ №${order.number} выдан клиенту`, link: `/orders/${order.id}` });
    await tx.orderEvent.create({
      data: { companyId, orderId: order.id, userId: input.userId, text: `Статус: «${order.status.name}» → «${closed.name}»` },
    });
  });
}

export type OrderUpdate = {
  orderType?: string;
  urgent?: boolean;
  color?: string | null;
  deviceType?: string;
  brand?: string | null;
  model?: string | null;
  serial?: string | null;
  problem?: string;
  equipment?: string | null;
  appearance?: string | null;
  notes?: string | null;
  verdict?: string | null;
  estimatedPrice?: number | null;
  dueDate?: Date | null;
  masterId?: string | null;
  managerId?: string | null;
  client?: { name?: string; address?: string | null; adSourceId?: string | null };
};

const FIELD_LABEL: Record<string, string> = {
  orderType: "Тип заказа",
  urgent: "Срочно",
  color: "Цвет",
  deviceType: "Тип устройства",
  brand: "Марка",
  model: "Модель",
  serial: "Серийный номер",
  problem: "Неисправность",
  equipment: "Комплектация",
  appearance: "Внешний вид",
  notes: "Комментарий приёмщика",
  verdict: "Вердикт",
  estimatedPrice: "Ориент. цена",
  dueDate: "Крайний срок",
  masterId: "Мастер",
  managerId: "Менеджер",
};

/** Сохраняет карточку заказа и пишет в историю, какие поля изменились. */
export async function updateOrder({ db, companyId }: Tenant, orderId: string, userId: string, u: OrderUpdate) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const { client, ...data } = u;
    if (data.problem !== undefined && !data.problem.trim()) throw new Error("Опишите неисправность");
    if (data.deviceType !== undefined && !data.deviceType.trim()) delete data.deviceType;
    const changed: string[] = [];
    for (const [k, v] of Object.entries(data)) {
      const old = (order as Record<string, unknown>)[k];
      const a = old instanceof Date ? old.getTime() : (old ?? null);
      const b = v instanceof Date ? v.getTime() : (v ?? null);
      if (a !== b) changed.push(k);
    }
    if (changed.length) {
      await tx.order.update({ where: { id: orderId }, data });
      const verdictText = changed.includes("verdict") && data.verdict ? `\nВердикт: ${data.verdict}` : "";
      await tx.orderEvent.create({
        data: { companyId, orderId, userId, text: `Изменены данные заказа: ${changed.map((c) => FIELD_LABEL[c] ?? c).join(", ")}${verdictText}` },
      });
    }
    if (client) {
      await tx.client.update({
        where: { id: order.clientId },
        data: {
          ...(client.name?.trim() ? { name: client.name.trim() } : {}),
          address: client.address ?? null,
          ...(client.adSourceId !== undefined ? { adSourceId: client.adSourceId } : {}),
        },
      });
    }
    await learnTx(tx, {
      DEVICE_TYPE: data.deviceType,
      BRAND: data.brand,
      MODEL: data.model,
      COLOR: data.color,
      DEFECT: data.problem,
      EQUIPMENT: data.equipment,
      APPEARANCE: data.appearance,
    });
    return changed.length;
  });
}

export async function setDiscount({ db, companyId }: Tenant, orderId: string, userId: string, d: { pct: number; sum: number }) {
  if (d.pct < 0 || d.pct > 100) throw new Error("Скидка в процентах должна быть от 0 до 100");
  if (d.sum < 0) throw new Error("Скидка не может быть отрицательной");
  return db.$transaction(async (tx) => {
    await assertOpen(tx, orderId);
    await tx.order.update({ where: { id: orderId }, data: { discountPct: d.pct, discountSum: d.sum } });
    const text = d.pct || d.sum ? `Скидка: ${[d.pct ? d.pct + "%" : "", d.sum ? (d.sum / 100).toLocaleString("ru-RU") + " ₽" : ""].filter(Boolean).join(" + ")}` : "Скидка убрана";
    await tx.orderEvent.create({ data: { companyId, orderId, userId, text } });
  });
}

export async function orderTotals({ db }: Tenant, orderId: string) {
  return orderTotalsTx(db, orderId);
}

export type Discount = { discountPct?: number | null; discountSum?: number | null };

export function totals(items: { kind: string; qty: number; price: number; cost: number }[], paid: number, disc?: Discount | null) {
  const services = items.filter((i) => i.kind === "SERVICE").reduce((s, i) => s + i.qty * i.price, 0);
  const parts = items.filter((i) => i.kind === "PART").reduce((s, i) => s + i.qty * i.price, 0);
  const partsCost = items.filter((i) => i.kind === "PART").reduce((s, i) => s + i.qty * i.cost, 0);
  const subtotal = services + parts;
  const pct = Math.min(100, Math.max(0, disc?.discountPct ?? 0));
  const discount = Math.min(subtotal, Math.round((subtotal * pct) / 100) + Math.max(0, disc?.discountSum ?? 0));
  const total = subtotal - discount;
  return { services, parts, partsCost, subtotal, discount, total, paid, due: total - paid, profit: total - partsCost };
}

// импорт ниже, чтобы избежать циклов
import { moveStockTx } from "./stock";
import { resolveCashbox, resolveWarehouse } from "./places";
import { logAction } from "./log";
import { learnTx } from "./dict";
import { priceOf } from "./prices";
