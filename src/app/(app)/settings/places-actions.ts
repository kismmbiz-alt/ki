"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { int, opt, safe, str } from "@/lib/action";
import { logAction } from "@/lib/domain/log";

export const saveCashboxAction = safe(async (fd) => {
  const ctx = await requirePermission("settings");
  const id = opt(fd, "id");
  const name = str(fd, "name");
  if (!name) throw new Error("Укажите название кассы");
  const locationId = opt(fd, "locationId");
  if (locationId) await ctx.db.location.findUniqueOrThrow({ where: { id: locationId } });
  const data = { name, locationId, sort: int(fd, "sort") };
  if (id) {
    const isActive = str(fd, "isActive") === "1";
    if (!isActive) {
      const used = await ctx.db.warehouse.count({ where: { cashboxId: id, isActive: true } });
      if (used) throw new Error("Касса привязана к складам. Сначала выберите для них другую кассу");
    }
    await ctx.db.cashbox.update({ where: { id }, data: { ...data, isActive } });
  } else await ctx.db.cashbox.create({ data: { ...data, companyId: ctx.company.id } });
  await logAction(ctx.db, { companyId: ctx.company.id, userId: ctx.user.id, kind: "settings", text: `${id ? "Изменена" : "Добавлена"} касса «${name}»` });
  revalidatePath("/", "layout");
  return id ? "Сохранено" : "Касса добавлена";
});

export const saveWarehouseAction = safe(async (fd) => {
  const ctx = await requirePermission("settings");
  const id = opt(fd, "id");
  const name = str(fd, "name");
  if (!name) throw new Error("Укажите название склада");
  const locationId = str(fd, "locationId");
  await ctx.db.location.findUniqueOrThrow({ where: { id: locationId } });
  const cashboxId = opt(fd, "cashboxId");
  if (cashboxId) {
    const c = await ctx.db.cashbox.findUniqueOrThrow({ where: { id: cashboxId } });
    if (c.locationId && c.locationId !== locationId) throw new Error(`Касса «${c.name}» относится к другой точке`);
  }
  const data = { name, cashboxId, sort: int(fd, "sort") };
  if (id) {
    const w = await ctx.db.warehouse.findUniqueOrThrow({ where: { id } });
    if (w.locationId !== locationId && (await ctx.db.stock.count({ where: { warehouseId: id, qty: { not: 0 } } })))
      throw new Error("На складе есть товар. Чтобы перенести склад в другую точку, сначала переместите товар");
    const isActive = str(fd, "isActive") === "1";
    if (!isActive && (await ctx.db.stock.count({ where: { warehouseId: id, qty: { not: 0 } } })))
      throw new Error("На складе есть товар. Сначала переместите или спишите его");
    if (w.locationId !== locationId) await ctx.db.stock.updateMany({ where: { warehouseId: id }, data: { locationId } });
    await ctx.db.warehouse.update({ where: { id }, data: { ...data, locationId, isActive } });
  } else await ctx.db.warehouse.create({ data: { ...data, locationId, companyId: ctx.company.id } });
  await logAction(ctx.db, { companyId: ctx.company.id, userId: ctx.user.id, locationId, kind: "settings", text: `${id ? "Изменён" : "Добавлен"} склад «${name}»` });
  revalidatePath("/", "layout");
  return id ? "Сохранено" : "Склад добавлен";
});
