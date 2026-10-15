import type { PayMethod } from "@prisma/client";
import type { Tenant } from "../db";

export const PAY_LABEL: Record<PayMethod, string> = { CASH: "Наличные", CARD: "Карта", TRANSFER: "Перевод" };

export const EXPENSE_CATEGORIES = ["Закупка запчастей", "Аренда", "Зарплата", "Реклама", "Хозяйственные расходы", "Инкассация", "Прочее"];
export const INCOME_CATEGORIES = ["Внесение в кассу", "Прочий приход"];

export async function addCashTransaction(
  { db, companyId }: Tenant,
  t: { locationId: string; userId: string; amount: number; method: PayMethod; category: string; comment?: string },
) {
  if (!t.amount) throw new Error("Укажите сумму");
  if (!t.category) throw new Error("Укажите статью");
  return db.cashTransaction.create({
    data: {
      companyId,
      locationId: t.locationId,
      userId: t.userId,
      amount: t.amount,
      method: t.method,
      category: t.category,
      comment: t.comment || null,
    },
  });
}

/** Остаток по способам оплаты для точки. */
export async function cashBalance({ db }: Tenant, locationId: string) {
  const rows = await db.cashTransaction.groupBy({ by: ["method"], where: { locationId }, _sum: { amount: true } });
  const out: Record<PayMethod, number> = { CASH: 0, CARD: 0, TRANSFER: 0 };
  for (const r of rows) out[r.method] = r._sum.amount ?? 0;
  return out;
}
