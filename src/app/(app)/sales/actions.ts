"use server";

import { redirect } from "next/navigation";
import { requireLocation, requirePermission } from "@/lib/auth";
import { safe, str } from "@/lib/action";
import { toKop } from "@/lib/money";
import { createSale } from "@/lib/domain/sales";
import type { PayMethod } from "@prisma/client";

export const createSaleAction = safe(async (fd) => {
  const ctx = await requirePermission("sales");
  const loc = requireLocation(ctx);
  const raw = JSON.parse(str(fd, "items") || "[]") as { productId: string; qty: number; price: string }[];
  await createSale(
    { db: ctx.db, companyId: ctx.company.id },
    {
      locationId: loc.id,
      userId: ctx.user.id,
      method: (str(fd, "method") || "CASH") as PayMethod,
      items: raw.map((r) => ({ productId: String(r.productId), qty: Math.floor(Number(r.qty)), price: toKop(r.price) })),
    },
  );
  redirect("/sales");
});
