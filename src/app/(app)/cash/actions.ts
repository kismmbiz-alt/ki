"use server";

import { revalidatePath } from "next/cache";
import { requireLocation, requirePermission } from "@/lib/auth";
import { opt, safe, str } from "@/lib/action";
import { toKop } from "@/lib/money";
import { addCashTransaction, deleteCashTx, editCashTx, transferCash } from "@/lib/domain/cash";
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
  const box = opt(fd, "cashboxId") ? await ctx.db.cashbox.findUniqueOrThrow({ where: { id: str(fd, "cashboxId") } }) : null;
  if (box?.locationId && ctx.user.locationId && box.locationId !== ctx.user.locationId) throw new Error("Касса другой точки");
  await addCashTransaction(
    { db: ctx.db, companyId: ctx.company.id },
    {
      locationId: box?.locationId ?? loc.id,
      cashboxId: opt(fd, "cashboxId"),
      userId: ctx.user.id,
      amount: sign * amount,
      method: method(fd),
      category: str(fd, "category"),
      comment: opt(fd, "comment") ?? undefined,
      recipientId: opt(fd, "recipientId"),
    },
  );
  revalidatePath("/cash", "layout");
  return sign < 0 ? "Выдача записана" : "Внесение записано";
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

const dayOf = (s: string, time?: Date) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  if (time) d.setHours(time.getHours(), time.getMinutes(), time.getSeconds());
  return d;
};

/** Правка транзакции: статья, даты выдачи и события, получатель, примечание, сумма. */
export const editTxAction = safe(async (fd) => {
  const ctx = await requirePermission("cashOps");
  const id = str(fd, "id");
  const x = await ctx.db.cashTransaction.findUniqueOrThrow({ where: { id } });
  await editCashTx({ db: ctx.db, companyId: ctx.company.id }, id, ctx.user.id, {
    category: str(fd, "category"),
    comment: opt(fd, "comment"),
    amount: Math.abs(toKop(fd.get("amount"))),
    createdAt: dayOf(str(fd, "issueDate"), x.createdAt) ?? x.createdAt,
    eventDate: dayOf(str(fd, "eventDate")),
    recipientId: opt(fd, "recipientId"),
    method: method(fd),
  });
  revalidatePath("/cash", "layout");
  return "Сохранено";
});

export const deleteTxAction = safe(async (fd) => {
  const ctx = await requirePermission("cashOps");
  await deleteCashTx({ db: ctx.db, companyId: ctx.company.id }, str(fd, "id"), ctx.user.id);
  revalidatePath("/cash", "layout");
  return "Операция удалена";
});
