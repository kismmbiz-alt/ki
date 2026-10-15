"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { can, requireLocation, requireUser } from "@/lib/auth";
import { safe, str, opt, int } from "@/lib/action";
import { toKop } from "@/lib/money";
import * as orders from "@/lib/domain/orders";
import type { PayMethod } from "@prisma/client";

async function ctxT() {
  const ctx = await requireUser();
  return { ctx, t: { db: ctx.db, companyId: ctx.company.id } };
}

/** Мастер может работать только со своими заказами. */
async function assertOrderAccess(orderId: string) {
  const { ctx, t } = await ctxT();
  const order = await ctx.db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Заказ не найден");
  if (!can(ctx.user.role, "allOrders") && order.masterId !== ctx.user.id) throw new Error("Нет доступа к заказу");
  return { ctx, t, order };
}

export const createOrderAction = safe(async (fd) => {
  const { ctx, t } = await ctxT();
  const location = requireLocation(ctx);
  const due = str(fd, "dueDate");
  const order = await orders.createOrder(t, {
    locationId: location.id,
    authorId: ctx.user.id,
    client: {
      id: opt(fd, "clientId") ?? undefined,
      name: str(fd, "clientName"),
      phone: str(fd, "clientPhone"),
      adSourceId: opt(fd, "adSourceId"),
    },
    deviceType: str(fd, "deviceType"),
    brand: opt(fd, "brand"),
    model: opt(fd, "model"),
    serial: opt(fd, "serial"),
    problem: str(fd, "problem"),
    equipment: opt(fd, "equipment"),
    appearance: opt(fd, "appearance"),
    notes: opt(fd, "notes"),
    estimatedPrice: str(fd, "estimatedPrice") ? toKop(fd.get("estimatedPrice")) : null,
    prepayment: toKop(fd.get("prepayment")),
    prepaymentMethod: (str(fd, "prepaymentMethod") || "CASH") as PayMethod,
    dueDate: due ? new Date(due) : null,
    masterId: opt(fd, "masterId"),
  });
  redirect(`/orders/${order.id}`);
});

export const changeStatusAction = safe(async (fd) => {
  const { ctx, t, order } = await assertOrderAccess(str(fd, "orderId"));
  await orders.changeStatus(t, order.id, str(fd, "statusId"), ctx.user.id);
  revalidatePath(`/orders/${order.id}`);
});

export const assignMasterAction = safe(async (fd) => {
  const { ctx, t, order } = await assertOrderAccess(str(fd, "orderId"));
  if (!can(ctx.user.role, "allOrders")) throw new Error("Назначать мастера может приёмщик или владелец");
  await orders.assignMaster(t, order.id, opt(fd, "masterId"), ctx.user.id);
  revalidatePath(`/orders/${order.id}`);
});

export const addServiceAction = safe(async (fd) => {
  const { ctx, t, order } = await assertOrderAccess(str(fd, "orderId"));
  const serviceId = opt(fd, "serviceId");
  let price = str(fd, "price") ? toKop(fd.get("price")) : null;
  if (price === null && serviceId) price = (await ctx.db.service.findUniqueOrThrow({ where: { id: serviceId } })).price;
  if (price === null) throw new Error("Укажите цену");
  await orders.addService(t, order.id, ctx.user.id, { serviceId, name: str(fd, "name"), price, qty: int(fd, "qty", 1) });
  revalidatePath(`/orders/${order.id}`);
  return "Работа добавлена";
});

export const addPartAction = safe(async (fd) => {
  const { ctx, t, order } = await assertOrderAccess(str(fd, "orderId"));
  const price = str(fd, "price") ? toKop(fd.get("price")) : undefined;
  await orders.addPart(t, order.id, ctx.user.id, { productId: str(fd, "productId"), qty: int(fd, "qty", 1), price });
  revalidatePath(`/orders/${order.id}`);
  return "Запчасть списана со склада";
});

export const removeItemAction = safe(async (fd) => {
  const { ctx, t, order } = await assertOrderAccess(str(fd, "orderId"));
  await orders.removeItem(t, str(fd, "itemId"), ctx.user.id);
  revalidatePath(`/orders/${order.id}`);
});

export const addPaymentAction = safe(async (fd) => {
  const { ctx, t, order } = await assertOrderAccess(str(fd, "orderId"));
  if (!can(ctx.user.role, "cash")) throw new Error("Принимать оплату может приёмщик или владелец");
  await orders.addPayment(t, {
    orderId: order.id,
    userId: ctx.user.id,
    amount: toKop(fd.get("amount")),
    method: (str(fd, "method") || "CASH") as PayMethod,
    refund: str(fd, "refund") === "1",
  });
  revalidatePath(`/orders/${order.id}`);
  return "Оплата проведена";
});

export const commentAction = safe(async (fd) => {
  const { ctx, t, order } = await assertOrderAccess(str(fd, "orderId"));
  await orders.addComment(t, order.id, ctx.user.id, str(fd, "text"));
  revalidatePath(`/orders/${order.id}`);
  return "Комментарий добавлен";
});

export const updateOrderAction = safe(async (fd) => {
  const { ctx, order } = await assertOrderAccess(str(fd, "orderId"));
  const due = str(fd, "dueDate");
  await ctx.db.order.update({
    where: { id: order.id },
    data: {
      deviceType: str(fd, "deviceType") || order.deviceType,
      brand: opt(fd, "brand"),
      model: opt(fd, "model"),
      serial: opt(fd, "serial"),
      problem: str(fd, "problem") || order.problem,
      equipment: opt(fd, "equipment"),
      appearance: opt(fd, "appearance"),
      notes: opt(fd, "notes"),
      estimatedPrice: str(fd, "estimatedPrice") ? toKop(fd.get("estimatedPrice")) : null,
      dueDate: due ? new Date(due) : null,
    },
  });
  await orders.addComment({ db: ctx.db, companyId: ctx.company.id }, order.id, ctx.user.id, "Изменены данные заказа");
  revalidatePath(`/orders/${order.id}`);
  return "Сохранено";
});
