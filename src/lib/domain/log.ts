import type { Tenant, Tx } from "../db";

export type LogKind = "cash" | "sale" | "order" | "stock" | "settings" | "users" | "buyback";

export const LOG_KIND_LABEL: Record<LogKind, string> = {
  cash: "Касса",
  sale: "Продажи",
  order: "Заказы",
  stock: "Склад",
  buyback: "Скупка",
  settings: "Настройки",
  users: "Сотрудники",
};

/** Запись в журнал действий сотрудников. */
export async function logAction(
  db: Tx | Tenant["db"],
  e: { companyId: string; userId?: string | null; locationId?: string | null; cashboxId?: string | null; kind: LogKind; text: string; amount?: number | null; link?: string | null },
) {
  await db.actionLog.create({
    data: {
      companyId: e.companyId,
      userId: e.userId ?? null,
      locationId: e.locationId ?? null,
      cashboxId: e.cashboxId ?? null,
      kind: e.kind,
      text: e.text.slice(0, 500),
      amount: e.amount ?? null,
      link: e.link ?? null,
    },
  });
}
