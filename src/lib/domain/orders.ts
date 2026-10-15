import type { Tx, Tenant } from "../db";
import { prisma } from "../db";
import { newPublicToken } from "./company";

export type NewOrderInput = {
  locationId: string;
  authorId: string;
  client: { id?: string; name?: string; phone?: string; adSourceId?: string | null };
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
        masterId: input.masterId || null,
        authorId: input.authorId,
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
    if (input.prepayment && input.prepayment > 0) {
      await addPaymentTx(tx, {
        orderId: order.id,
        locationId: input.locationId,
        userId: input.authorId,
        amount: input.prepayment,
        method: input.prepaymentMethod ?? "CASH",
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

export async function changeStatus({ db, companyId }: Tenant, orderId: string, statusId: string, userId: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { status: true } });
    const status = await tx.orderStatus.findUniqueOrThrow({ where: { id: statusId } });
    if (order.statusId === statusId) return order;
    const closing = status.kind === "CLOSED" || status.kind === "CANCELED";
    if (status.kind === "CLOSED") {
      const t = await orderTotalsTx(tx, orderId);
      if (t.due > 0) throw new Error(`Нельзя выдать заказ: клиент должен ещё ${(t.due / 100).toLocaleString("ru-RU")} ₽`);
    }
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { statusId, closedAt: closing ? new Date() : null },
    });
    await tx.orderEvent.create({
      data: { companyId, orderId, userId, text: `Статус: «${order.status.name}» → «${status.name}»` },
    });
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
  item: { serviceId?: string | null; name?: string; price: number; qty?: number },
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
      data: { companyId, orderId, kind: "SERVICE", serviceId: item.serviceId || null, name, qty: item.qty ?? 1, price: item.price },
    });
    await tx.orderEvent.create({ data: { companyId, orderId, userId, text: `Добавлена работа: ${name}` } });
  });
}

/** Запчасть в заказ: списывается со склада точки, где оформлен заказ. */
export async function addPart(
  { db, companyId }: Tenant,
  orderId: string,
  userId: string,
  item: { productId: string; qty: number; price?: number },
) {
  if (item.qty <= 0) throw new Error("Количество должно быть больше нуля");
  return db.$transaction(async (tx) => {
    const order = await assertOpen(tx, orderId);
    const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId } });
    await moveStockTx(tx, {
      productId: product.id,
      locationId: order.locationId,
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
        price: item.price ?? product.price,
        cost: product.cost,
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
  input: { orderId: string; userId: string; amount: number; method: "CASH" | "CARD" | "TRANSFER"; refund?: boolean },
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
    });
  });
}

async function addPaymentTx(
  tx: Tx,
  p: { orderId: string; locationId: string; userId: string; amount: number; method: "CASH" | "CARD" | "TRANSFER"; prepayment?: boolean },
) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: p.orderId } });
  const companyId = order.companyId;
  const category = p.amount < 0 ? "Возврат по заказу" : p.prepayment ? "Предоплата по заказу" : "Оплата заказа";
  await tx.cashTransaction.create({
    data: { companyId,
      locationId: p.locationId,
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
  const items = await tx.orderItem.findMany({ where: { orderId } });
  const paidAgg = await tx.cashTransaction.aggregate({ where: { orderId }, _sum: { amount: true } });
  return totals(items, paidAgg._sum.amount ?? 0);
}

export async function orderTotals({ db }: Tenant, orderId: string) {
  return orderTotalsTx(db, orderId);
}

export function totals(items: { kind: string; qty: number; price: number; cost: number }[], paid: number) {
  const services = items.filter((i) => i.kind === "SERVICE").reduce((s, i) => s + i.qty * i.price, 0);
  const parts = items.filter((i) => i.kind === "PART").reduce((s, i) => s + i.qty * i.price, 0);
  const partsCost = items.filter((i) => i.kind === "PART").reduce((s, i) => s + i.qty * i.cost, 0);
  const total = services + parts;
  return { services, parts, partsCost, total, paid, due: total - paid, profit: total - partsCost };
}

// импорт ниже, чтобы избежать циклов
import { moveStockTx } from "./stock";
