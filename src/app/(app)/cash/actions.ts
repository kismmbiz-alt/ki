"use server";

import { revalidatePath } from "next/cache";
import { requireLocation, requirePermission } from "@/lib/auth";
import { opt, safe, str } from "@/lib/action";
import { toKop } from "@/lib/money";
import { addCashTransaction } from "@/lib/domain/cash";
import type { PayMethod } from "@prisma/client";

export const cashAction = safe(async (fd) => {
  const ctx = await requirePermission("cash");
  const loc = requireLocation(ctx);
  const amount = Math.abs(toKop(fd.get("amount")));
  const sign = str(fd, "type") === "expense" ? -1 : 1;
  await addCashTransaction(
    { db: ctx.db, companyId: ctx.company.id },
    {
      locationId: loc.id,
      userId: ctx.user.id,
      amount: sign * amount,
      method: (str(fd, "method") || "CASH") as PayMethod,
      category: str(fd, "category"),
      comment: opt(fd, "comment") ?? undefined,
    },
  );
  revalidatePath("/cash");
  return sign < 0 ? "Расход записан" : "Приход записан";
});
