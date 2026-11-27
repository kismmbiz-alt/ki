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
  t: {
    locationId: string;
    cashboxId?: string | null;
    userId: string;
    amount: number;
    method: PayMethod;
    category: string;
    comment?: string;
    eventDate?: Date | null;
    createdAt?: Date | null;
    stockDocId?: string | null;
    supplierId?: string | null;
    recipientId?: string | null;
  },
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
        eventDate: t.eventDate ?? null,
        stockDocId: t.stockDocId ?? null,
        supplierId: t.supplierId ?? null,
        recipientId: t.recipientId ?? null,
        ...(t.createdAt ? { createdAt: t.createdAt } : {}),
      },
    });
    await tx.cashTxLog.create({ data: { companyId, txId: row.id, userId: t.userId, action: "CREATE", amount: t.amount, date: row.createdAt } });
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

/** Операцию можно править и удалять, только если она не часть заказа, чека или перевода. */
export const isEditableTx = (x: { orderId: string | null; saleId: string | null; transferId: string | null; stockDocId?: string | null; deletedAt: Date | null }) =>
  !x.orderId && !x.saleId && !x.transferId && !x.stockDocId && !x.deletedAt;

/** Правка кассовой операции как в LiveSklad: статья, даты, получатель, примечание, сумма. Пишется в историю. */
export async function editCashTx(
  { db, companyId }: Tenant,
  id: string,
  userId: string,
  e: { category: string; comment: string | null; amount: number; createdAt: Date; eventDate: Date | null; recipientId: string | null; method: PayMethod },
) {
  if (!(e.amount > 0)) throw new Error("Укажите сумму");
  if (!e.category) throw new Error("Укажите статью");
  return db.$transaction(async (tx) => {
    const x = await tx.cashTransaction.findUniqueOrThrow({ where: { id } });
    if (!isEditableTx(x)) throw new Error("Эту операцию меняют через её документ: заказ, чек, поступление или перевод");
    const amount = x.amount < 0 ? -e.amount : e.amount;
    await tx.cashTransaction.update({
      where: { id },
      data: { category: e.category, comment: e.comment, amount, createdAt: e.createdAt, eventDate: e.eventDate, recipientId: e.recipientId, method: e.method, editedAt: new Date() },
    });
    const parts = [x.amount !== amount && `сумма ${x.amount / 100} → ${amount / 100}`, x.category !== e.category && `статья «${x.category}» → «${e.category}»`].filter(Boolean);
    await tx.cashTxLog.create({ data: { companyId, txId: id, userId, action: "EDIT", amount, date: e.createdAt, note: parts.join(", ") || null } });
    await logAction(tx, { companyId, userId, locationId: x.locationId, cashboxId: x.cashboxId, kind: "cash", text: `Изменена операция «${e.category}»${parts.length ? `: ${parts.join(", ")}` : ""}`, amount });
  });
}

/** Удаление: операция остаётся в списке «Удалённые», сумма обнуляется, остаток кассы пересчитывается. */
export async function deleteCashTx({ db, companyId }: Tenant, id: string, userId: string) {
  return db.$transaction(async (tx) => {
    const x = await tx.cashTransaction.findUniqueOrThrow({ where: { id } });
    if (!isEditableTx(x)) throw new Error("Эту операцию отменяют через её документ: заказ, чек, поступление или перевод");
    await tx.cashTransaction.update({ where: { id }, data: { deletedAt: new Date(), origAmount: x.amount, amount: 0 } });
    await tx.salaryEntry.deleteMany({ where: { cashTxId: id } });
    await tx.cashTxLog.create({ data: { companyId, txId: id, userId, action: "DELETE", amount: x.amount, date: x.createdAt } });
    await logAction(tx, { companyId, userId, locationId: x.locationId, cashboxId: x.cashboxId, kind: "cash", text: `Удалена операция «${x.category}»`, amount: x.amount });
  });
}

/** Статьи для выбора: стандартные плюс все, что уже встречались в кассах компании. */
export async function cashCategories({ db }: Tenant) {
  const used = await db.cashTransaction.groupBy({ by: ["category"], where: { transferId: null, orderId: null, saleId: null } });
  const all = new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, ...used.map((u) => u.category)]);
  return [...all].filter((c) => c !== TRANSFER_CATEGORY).sort((a, b) => a.localeCompare(b, "ru"));
}
