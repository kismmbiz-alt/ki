"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { PayMethod } from "@prisma/client";
import { can, requireLocation, requirePermission } from "@/lib/auth";
import { safe, str, opt, int } from "@/lib/action";
import { toKop } from "@/lib/money";
import { closeShift, createSale, openShift, returnSale } from "@/lib/domain/sales";
import { normalizePhone } from "@/lib/domain/orders";
import { refreshBonus } from "@/lib/domain/bonus";

export const createSaleAction = safe(async (fd) => {
  const ctx = await requirePermission("sales");
  const loc = requireLocation(ctx);
  const raw = JSON.parse(str(fd, "items") || "[]") as { productId: string; qty: number; price: string }[];
  const sale = await createSale(
    { db: ctx.db, companyId: ctx.company.id },
    {
      locationId: loc.id,
      warehouseId: opt(fd, "warehouseId"),
      cashboxId: opt(fd, "cashboxId"),
      userId: ctx.user.id,
      method: (str(fd, "method") || "CASH") as PayMethod,
      discount: toKop(fd.get("discount")),
      client: { phone: str(fd, "clientPhone"), name: str(fd, "clientName") },
      allowBelowMin: can(ctx.user, "belowMin"),
      bonusPay: str(fd, "bonusPay") ? toKop(fd.get("bonusPay")) : 0,
      items: raw.map((r) => ({ productId: String(r.productId), qty: Math.floor(Number(r.qty)), price: toKop(r.price) })),
    },
  );
  redirect(`/sales/${sale.id}?done=1`);
});

export const returnSaleAction = safe(async (fd) => {
  const ctx = await requirePermission("salesReturn");
  const saleId = str(fd, "saleId");
  const items = [...fd.keys()].filter((k) => k.startsWith("ret_")).map((k) => ({ saleItemId: k.slice(4), qty: int(fd, k, 0) }));
  const ret = await returnSale(
    { db: ctx.db, companyId: ctx.company.id },
    { saleId, userId: ctx.user.id, method: (str(fd, "method") || "CASH") as PayMethod, cashboxId: opt(fd, "cashboxId"), items, reason: opt(fd, "reason") ?? undefined },
  );
  redirect(`/sales/${ret.id}`);
});

export const openShiftAction = safe(async (fd) => {
  const ctx = await requirePermission("sales");
  const loc = requireLocation(ctx);
  await openShift({ db: ctx.db, companyId: ctx.company.id }, { locationId: loc.id, cashboxId: opt(fd, "cashboxId"), userId: ctx.user.id });
  revalidatePath("/sales", "layout");
  return "Смена открыта";
});

export const closeShiftAction = safe(async (fd) => {
  const ctx = await requirePermission("sales");
  const loc = requireLocation(ctx);
  if (!str(fd, "closeCash")) throw new Error("Пересчитайте наличные в кассе и впишите сумму");
  await closeShift({ db: ctx.db, companyId: ctx.company.id }, { locationId: loc.id, cashboxId: opt(fd, "cashboxId"), userId: ctx.user.id, closeCash: toKop(fd.get("closeCash")), comment: opt(fd, "comment") });
  revalidatePath("/sales", "layout");
  return "Смена закрыта";
});

/** Баллы клиента по телефону для экрана продажи (без раскрытия контактов). */
export async function bonusLookupAction(phone: string) {
  const ctx = await requirePermission("sales");
  const p = normalizePhone(phone);
  if (p.length < 8) return null;
  const c = await ctx.db.client.findFirst({ where: { phone: p }, select: { id: true, name: true } });
  if (!c) return null;
  const st = await refreshBonus(ctx.db, ctx.company.id, c.id);
  const visits = (await ctx.db.sale.count({ where: { clientId: c.id, isReturn: false } })) + (await ctx.db.order.count({ where: { clientId: c.id } }));
  return { name: c.name, available: st.available, visits };
}

/** Плитки продажи: настраивают владелец и администратор. */
export const saveSaleTilesAction = safe(async (fd) => {
  const ctx = await requirePermission("settings");
  for (const side of ["PRIORITY", "FREQUENT"]) {
    for (let slot = 0; slot < 4; slot++) {
      const productId = String(fd.get(`${side}-${slot}`) ?? "");
      await ctx.db.saleTile.deleteMany({ where: { side, slot } });
      if (productId) {
        await ctx.db.product.findUniqueOrThrow({ where: { id: productId } });
        await ctx.db.saleTile.create({ data: { companyId: ctx.company.id, side, slot, productId } });
      }
    }
  }
  revalidatePath("/sales", "layout");
  return "Плитки сохранены";
});
