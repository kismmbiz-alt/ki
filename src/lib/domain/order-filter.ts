import type { Prisma, StatusKind } from "@prisma/client";
import { normalizePhone } from "./orders";

export const ORDER_TABS: { key: string; label: string; kinds?: StatusKind[] }[] = [
  { key: "open", label: "Текущие", kinds: ["NEW", "IN_PROGRESS", "WAITING", "READY"] },
  { key: "new", label: "Новые", kinds: ["NEW"] },
  { key: "work", label: "В работе", kinds: ["IN_PROGRESS"] },
  { key: "wait", label: "Отложенные", kinds: ["WAITING"] },
  { key: "ready", label: "Готовые", kinds: ["READY"] },
  { key: "closed", label: "Выданные", kinds: ["CLOSED"] },
  { key: "canceled", label: "Отказы", kinds: ["CANCELED"] },
  { key: "all", label: "Все" },
];

export type OrderFilter = {
  tab?: string;
  q?: string;
  status?: string;
  master?: string;
  manager?: string;
  type?: string;
  urgent?: string;
  overdue?: string;
  from?: string;
  to?: string;
};

/** Условия поиска заказов из параметров адресной строки (список и выгрузка в Excel). */
export function orderWhere(f: OrderFilter, scope: { locationId?: string; onlyMasterId?: string }, opts: { ignoreTab?: boolean } = {}) {
  const where: Prisma.OrderWhereInput = {};
  const and: Prisma.OrderWhereInput[] = [];
  if (scope.locationId) where.locationId = scope.locationId;
  if (scope.onlyMasterId) where.masterId = scope.onlyMasterId;
  if (f.status) where.statusId = f.status;
  else if (!opts.ignoreTab) {
    const tab = ORDER_TABS.find((t) => t.key === (f.tab ?? "open"));
    if (tab?.kinds) where.status = { kind: { in: tab.kinds } };
  }
  if (f.master) where.masterId = f.master === "none" ? null : f.master;
  if (f.manager) where.managerId = f.manager;
  if (f.type) where.orderType = f.type;
  if (f.urgent === "1") where.urgent = true;
  if (f.overdue === "1") {
    and.push({ dueDate: { lt: new Date() } }, { status: { kind: { in: ["NEW", "IN_PROGRESS", "WAITING"] } } });
  }
  if (f.from) and.push({ createdAt: { gte: new Date(f.from) } });
  if (f.to) and.push({ createdAt: { lt: new Date(new Date(f.to).getTime() + 864e5) } });
  const q = f.q?.trim();
  if (q) {
    const num = /^\d+$/.test(q) ? parseInt(q, 10) : undefined;
    const phone = normalizePhone(q);
    and.push({
      OR: [
        ...(num && num < 2_000_000_000 ? [{ number: num }] : []),
        { client: { name: { contains: q, mode: "insensitive" } } },
        ...(phone.length > 4 ? [{ client: { phone: { contains: phone.slice(-7) } } }] : []),
        { model: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
        { serial: { contains: q, mode: "insensitive" } },
        { problem: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (and.length) where.AND = and;
  return where;
}
