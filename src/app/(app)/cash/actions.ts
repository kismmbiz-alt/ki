"use server";

import { revalidatePath } from "next/cache";
import { requireLocation, requirePermission } from "@/lib/auth";
import { opt, safe, str } from "@/lib/action";
import { toKop } from "@/lib/money";
import { addCashTransaction, transferCash } from "@/lib/domain/cash";
import type { PayMethod } from "@prisma/client";

const method = (fd: FormData) => {
  const m = str(fd, "method") || "CASH";
  if (!["CASH", "CARD", "TRANSFER"].includes(m)) throw new Error("Неизвестный способ оплаты");
  return m as PayMethod;
};

export const cashAction = safe(async (fd) => {
  const ctx = await requirePermission("cashOps");
  const loc = requireLocation(ctx);
  const amount = Math.abs(toKop(fd.get("amount")));
  const sign = str(fd, "type") === "expense" ? -1 : 1;
  await addCashTransaction(
    { db: ctx.db, companyId: ctx.company.id },
    {
      locationId: loc.id,
      cashboxId: opt(fd, "cashboxId"),
      userId: ctx.user.id,
      amount: sign * amount,
      method: method(fd),
      category: str(fd, "category"),
      comment: opt(fd, "comment") ?? undefined,
    },
  );
  revalidatePath("/cash", "layout");
  return sign < 0 ? "Расход записан" : "Приход записан";
});

export const transferAction = safe(async (fd) => {
  const ctx = await requirePermission("cashTransfer");
  const loc = requireLocation(ctx);
  if (ctx.user.locationId) {
    const boxes = await ctx.db.cashbox.findMany({ where: { id: { in: [str(fd, "fromCashboxId"), str(fd, "toCashboxId")] } } });
    if (boxes.some((b) => b.locationId && b.locationId !== ctx.user.locationId)) throw new Error("Можно переводить только между кассами своей точки");
  }
  await transferCash(
    { db: ctx.db, companyId: ctx.company.id },
    {
      fromCashboxId: str(fd, "fromCashboxId"),
      toCashboxId: str(fd, "toCashboxId"),
      amount: Math.abs(toKop(fd.get("amount"))),
      method: method(fd),
      userId: ctx.user.id,
      locationId: loc.id,
      comment: opt(fd, "comment"),
    },
  );
  revalidatePath("/cash", "layout");
  return "Перевод выполнен";
});
