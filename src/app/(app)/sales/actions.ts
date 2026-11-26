"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { PayMethod } from "@prisma/client";
import { can, requireLocation, requirePermission } from "@/lib/auth";
import { safe, str, opt, int } from "@/lib/action";
import { toKop } from "@/lib/money";
import { closeShift, createSale, openShift, returnSale } from "@/lib/domain/sales";

export const createSaleAction = safe(async (fd) => {
  const ctx = await requirePermission("sales");
  const loc = requireLocation(ctx);
  const raw = JSON.parse(str(fd, "items") || "[]") as { productId: string; qty: number; price: string }[];
  const sale = await createSale(
    { db: ctx.db, companyId: ctx.company.id },
    {
      locationId: loc.id,
      userId: ctx.user.id,
      method: (str(fd, "method") || "CASH") as PayMethod,
      discount: toKop(fd.get("discount")),
      client: { phone: str(fd, "clientPhone"), name: str(fd, "clientName") },
      allowBelowMin: can(ctx.user.role, "settings"),
      items: raw.map((r) => ({ productId: String(r.productId), qty: Math.floor(Number(r.qty)), price: toKop(r.price) })),
    },
  );
  redirect(`/sales/${sale.id}?done=1`);
});

export const returnSaleAction = safe(async (fd) => {
  const ctx = await requirePermission("sales");
  const saleId = str(fd, "saleId");
  const items = [...fd.keys()].filter((k) => k.startsWith("ret_")).map((k) => ({ saleItemId: k.slice(4), qty: int(fd, k, 0) }));
  const ret = await returnSale(
    { db: ctx.db, companyId: ctx.company.id },
    { saleId, userId: ctx.user.id, method: (str(fd, "method") || "CASH") as PayMethod, items, reason: opt(fd, "reason") ?? undefined },
  );
  redirect(`/sales/${ret.id}`);
});

export const openShiftAction = safe(async () => {
  const ctx = await requirePermission("sales");
  const loc = requireLocation(ctx);
  await openShift({ db: ctx.db, companyId: ctx.company.id }, { locationId: loc.id, userId: ctx.user.id });
  revalidatePath("/sales", "layout");
  return "Смена открыта";
});

export const closeShiftAction = safe(async (fd) => {
  const ctx = await requirePermission("sales");
  const loc = requireLocation(ctx);
  if (!str(fd, "closeCash")) throw new Error("Пересчитайте наличные в кассе и впишите сумму");
  await closeShift({ db: ctx.db, companyId: ctx.company.id }, { locationId: loc.id, userId: ctx.user.id, closeCash: toKop(fd.get("closeCash")), comment: opt(fd, "comment") });
  revalidatePath("/sales", "layout");
  return "Смена закрыта";
});
