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
      address: opt(fd, "clientAddress"),
      adSourceId: opt(fd, "adSourceId"),
    },
    orderType: opt(fd, "orderType"),
    color: opt(fd, "color"),
    urgent: str(fd, "urgent") === "1",
    managerId: opt(fd, "managerId"),
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
  await orders.addService(t, order.id, ctx.user.id, { serviceId, name: str(fd, "name"), price, qty: int(fd, "qty", 1), warrantyDays: warranty(fd) });
  revalidatePath(`/orders/${order.id}`);
  return "Работа добавлена";
});

export const addPartAction = safe(async (fd) => {
  const { ctx, t, order } = await assertOrderAccess(str(fd, "orderId"));
  const price = str(fd, "price") ? toKop(fd.get("price")) : undefined;
  await orders.addPart(t, order.id, ctx.user.id, { productId: str(fd, "productId"), qty: int(fd, "qty", 1), price, warrantyDays: warranty(fd) });
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

const warranty = (fd: FormData) => (str(fd, "warrantyDays") ? int(fd, "warrantyDays") : null);

export const updateOrderAction = safe(async (fd) => {
  const { ctx, t, order } = await assertOrderAccess(str(fd, "orderId"));
  const due = str(fd, "dueDate");
  const manage = can(ctx.user.role, "allOrders");
  const n = await orders.updateOrder(t, order.id, ctx.user.id, {
    orderType: str(fd, "orderType") || order.orderType,
    urgent: str(fd, "urgent") === "1",
    color: opt(fd, "color"),
    deviceType: str(fd, "deviceType"),
    brand: opt(fd, "brand"),
    model: opt(fd, "model"),
    serial: opt(fd, "serial"),
    problem: str(fd, "problem"),
    equipment: opt(fd, "equipment"),
    appearance: opt(fd, "appearance"),
    notes: opt(fd, "notes"),
    verdict: opt(fd, "verdict"),
    estimatedPrice: str(fd, "estimatedPrice") ? toKop(fd.get("estimatedPrice")) : null,
    dueDate: due ? new Date(due) : null,
    ...(manage ? { masterId: opt(fd, "masterId"), managerId: opt(fd, "managerId") } : {}),
    ...(manage && fd.has("clientName")
      ? { client: { name: str(fd, "clientName"), address: opt(fd, "clientAddress"), adSourceId: opt(fd, "adSourceId") } }
      : {}),
  });
  revalidatePath(`/orders/${order.id}`);
  return n ? "Сохранено" : "Изменений нет";
});

export const verdictAction = safe(async (fd) => {
  const { ctx, t, order } = await assertOrderAccess(str(fd, "orderId"));
  await orders.updateOrder(t, order.id, ctx.user.id, { verdict: opt(fd, "verdict") });
  revalidatePath(`/orders/${order.id}`);
  return "Сохранено";
});

export const discountAction = safe(async (fd) => {
  const { ctx, t, order } = await assertOrderAccess(str(fd, "orderId"));
  if (!can(ctx.user.role, "cash")) throw new Error("Скидку даёт приёмщик или владелец");
  await orders.setDiscount(t, order.id, ctx.user.id, { pct: int(fd, "discountPct", 0), sum: toKop(fd.get("discountSum")) });
  revalidatePath(`/orders/${order.id}`);
});

export const issueOrderAction = safe(async (fd) => {
  const { ctx, t, order } = await assertOrderAccess(str(fd, "orderId"));
  if (!can(ctx.user.role, "cash")) throw new Error("Выдаёт заказ приёмщик или владелец");
  await orders.issueOrder(t, {
    orderId: order.id,
    userId: ctx.user.id,
    method: (str(fd, "method") || "CASH") as PayMethod,
    takePayment: str(fd, "takePayment") === "1",
  });
  revalidatePath(`/orders/${order.id}`);
  return "Заказ выдан";
});

const MAX_FILE = 8 * 1024 * 1024;

export const uploadFilesAction = safe(async (fd) => {
  const { ctx, order } = await assertOrderAccess(str(fd, "orderId"));
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) throw new Error("Выберите файл");
  for (const f of files) {
    if (f.size > MAX_FILE) throw new Error(`Файл «${f.name}» больше 8 МБ`);
    await ctx.db.orderFile.create({
      data: {
        companyId: ctx.company.id,
        orderId: order.id,
        userId: ctx.user.id,
        name: f.name.slice(0, 200),
        mime: f.type || "application/octet-stream",
        size: f.size,
        data: Buffer.from(await f.arrayBuffer()),
      },
    });
  }
  await orders.addComment({ db: ctx.db, companyId: ctx.company.id }, order.id, ctx.user.id, `Добавлены файлы: ${files.map((f) => f.name).join(", ")}`);
  revalidatePath(`/orders/${order.id}`);
  return "Файлы загружены";
});

export const deleteFileAction = safe(async (fd) => {
  const { ctx, order } = await assertOrderAccess(str(fd, "orderId"));
  const file = await ctx.db.orderFile.findFirst({ where: { id: str(fd, "fileId"), orderId: order.id }, select: { id: true, name: true } });
  if (!file) throw new Error("Файл не найден");
  await ctx.db.orderFile.delete({ where: { id: file.id } });
  await orders.addComment({ db: ctx.db, companyId: ctx.company.id }, order.id, ctx.user.id, `Удалён файл: ${file.name}`);
  revalidatePath(`/orders/${order.id}`);
});
