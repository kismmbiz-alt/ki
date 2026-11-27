import { randomUUID } from "crypto";
import type { PayMethod } from "@prisma/client";
import type { Tenant } from "../db";
import { resolveCashbox } from "./places";
import { logAction } from "./log";

export const PAY_LABEL: Record<PayMethod, string> = { CASH: "Наличные", CARD: "Карта", TRANSFER: "Перевод" };

export const EXPENSE_CATEGORIES = ["Закупка запчастей", "Выкуп техники", "Аренда", "Зарплата", "Реклама", "Хозяйственные расходы", "Инкассация", "Прочее"];
export const INCOME_CATEGORIES = ["Внесение в кассу", "Начальный остаток", "Прочий приход"];
export const TRANSFER_CATEGORY = "Перевод между кассами";

export async function addCashTransaction(
  { db, companyId }: Tenant,
  t: { locationId: string; cashboxId?: string | null; userId: string; amount: number; method: PayMethod; category: string; comment?: string },
) {
  if (!t.amount) throw new Error("Укажите сумму");
  if (!t.category) throw new Error("Укажите статью");
  return db.$transaction(async (tx) => {
    const cashboxId = await resolveCashbox(tx, t.locationId, t.cashboxId);
    const row = await tx.cashTransaction.create({
      data: {
        companyId,
        locationId: t.locationId,
        cashboxId,
        userId: t.userId,
        amount: t.amount,
        method: t.method,
        category: t.category,
        comment: t.comment || null,
      },
    });
    const box = await tx.cashbox.findUniqueOrThrow({ where: { id: cashboxId } });
    await logAction(tx, {
      companyId,
      userId: t.userId,
      locationId: t.locationId,
      cashboxId,
      kind: "cash",
      text: `${t.amount < 0 ? "Расход" : "Приход"} «${t.category}», касса «${box.name}»${t.comment ? `: ${t.comment}` : ""}`,
      amount: t.amount,
    });
    return row;
  });
}

/**
 * Перевод денег из одной кассы в другую: две операции с общим transferId.
 * Остаток компании не меняется, меняются остатки касс.
 */
export async function transferCash(
  { db, companyId }: Tenant,
  t: { fromCashboxId: string; toCashboxId: string; amount: number; userId: string; locationId: string; method?: PayMethod; toMethod?: PayMethod; comment?: string | null },
) {
  if (!(t.amount > 0)) throw new Error("Сумма перевода должна быть больше нуля");
  if (t.fromCashboxId === t.toCashboxId) throw new Error("Выберите разные кассы");
  return db.$transaction(async (tx) => {
    const [from, to] = await Promise.all([
      tx.cashbox.findUniqueOrThrow({ where: { id: t.fromCashboxId } }),
      tx.cashbox.findUniqueOrThrow({ where: { id: t.toCashboxId } }),
    ]);
    if (!from.isActive || !to.isActive) throw new Error("Одна из касс отключена");
    const transferId = randomUUID();
    const base = { companyId, userId: t.userId, category: TRANSFER_CATEGORY, transferId };
    await tx.cashTransaction.create({
      data: {
        ...base,
        locationId: from.locationId ?? t.locationId,
        cashboxId: from.id,
        amount: -t.amount,
        method: t.method ?? "CASH",
        comment: `В кассу «${to.name}»${t.comment ? `: ${t.comment}` : ""}`,
      },
    });
    await tx.cashTransaction.create({
      data: {
        ...base,
        locationId: to.locationId ?? t.locationId,
        cashboxId: to.id,
        amount: t.amount,
        method: t.toMethod ?? t.method ?? "CASH",
        comment: `Из кассы «${from.name}»${t.comment ? `: ${t.comment}` : ""}`,
      },
    });
    await logAction(tx, {
      companyId,
      userId: t.userId,
      locationId: t.locationId,
      cashboxId: from.id,
      kind: "cash",
      text: `Перевод из кассы «${from.name}» в кассу «${to.name}»${t.comment ? `: ${t.comment}` : ""}`,
      amount: t.amount,
    });
    return transferId;
  });
}

/** Остатки касс: всего и по способам оплаты. */
export async function cashboxBalances({ db }: Tenant, cashboxIds: string[]) {
  const rows = await db.cashTransaction.groupBy({ by: ["cashboxId", "method"], where: { cashboxId: { in: cashboxIds } }, _sum: { amount: true } });
  const out = new Map<string, Record<PayMethod | "total", number>>();
  for (const id of cashboxIds) out.set(id, { CASH: 0, CARD: 0, TRANSFER: 0, total: 0 });
  for (const r of rows) {
    const b = out.get(r.cashboxId)!;
    b[r.method] += r._sum.amount ?? 0;
    b.total += r._sum.amount ?? 0;
  }
  return out;
}

/** Остаток по способам оплаты для точки. */
export async function cashBalance({ db }: Tenant, locationId: string) {
  const rows = await db.cashTransaction.groupBy({ by: ["method"], where: { locationId }, _sum: { amount: true } });
  const out: Record<PayMethod, number> = { CASH: 0, CARD: 0, TRANSFER: 0 };
  for (const r of rows) out[r.method] = r._sum.amount ?? 0;
  return out;
}
