import type { Prisma, StatusKind } from "@prisma/client";
import type { Tenant } from "../db";
import { totals } from "./orders";

export type Period = "week" | "month" | "year";

const DAY = 864e5;
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function periodRange(p: Period, now = new Date()) {
  const today = startOfDay(now);
  if (p === "week") {
    const dow = (today.getDay() + 6) % 7; // пн = 0
    const from = new Date(today.getTime() - dow * DAY);
    return { from, to: new Date(from.getTime() + 7 * DAY), prevFrom: new Date(from.getTime() - 7 * DAY) };
  }
  if (p === "month") {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from, to: new Date(today.getFullYear(), today.getMonth() + 1, 1), prevFrom: new Date(today.getFullYear(), today.getMonth() - 1, 1) };
  }
  const from = new Date(today.getFullYear(), 0, 1);
  return { from, to: new Date(today.getFullYear() + 1, 0, 1), prevFrom: new Date(today.getFullYear() - 1, 0, 1) };
}

export const FUNNEL: { key: string; label: string; kinds: StatusKind[]; color: string }[] = [
  { key: "new", label: "Новые", kinds: ["NEW"], color: "#4f6bff" },
  { key: "work", label: "В работе", kinds: ["IN_PROGRESS"], color: "#8b5cf6" },
  { key: "wait", label: "Отложенные", kinds: ["WAITING"], color: "#f59e0b" },
  { key: "ready", label: "Готовые", kinds: ["READY"], color: "#22c55e" },
  { key: "closed", label: "Выданные", kinds: ["CLOSED"], color: "#94a3b8" },
];

const orderSum = (o: { items: { kind: string; qty: number; price: number; cost: number }[]; discountPct: number; discountSum: number }) =>
  totals(o.items, 0, o).total;

export async function dashboard(
  { db }: Tenant,
  opts: { locationId?: string; userId?: string; mine?: boolean; period: Period },
) {
  const now = new Date();
  const today = startOfDay(now);
  const base: Prisma.OrderWhereInput = {};
  if (opts.locationId) base.locationId = opts.locationId;
  if (opts.mine && opts.userId) base.OR = [{ masterId: opts.userId }, { managerId: opts.userId }];
  const r = periodRange(opts.period, now);
  const saleLoc = opts.locationId ? { locationId: opts.locationId } : {};
  const saleMine = opts.mine && opts.userId ? { userId: opts.userId } : {};

  const itemSel = { select: { kind: true, qty: true, price: true, cost: true } } as const;
  const [open, closedPeriod, closedCount, todayCount, sales, prevClosed, prevSales] = await Promise.all([
    db.order.findMany({
      where: { ...base, status: { kind: { in: ["NEW", "IN_PROGRESS", "WAITING", "READY"] } } },
      select: { id: true, number: true, dueDate: true, urgent: true, model: true, brand: true, deviceType: true, discountPct: true, discountSum: true, status: { select: { kind: true, name: true, color: true } }, client: { select: { name: true } }, items: itemSel },
    }),
    db.order.findMany({
      where: { ...base, status: { kind: "CLOSED" }, closedAt: { gte: r.from, lt: r.to } },
      select: { closedAt: true, discountPct: true, discountSum: true, items: itemSel },
    }),
    db.order.count({ where: { ...base, status: { kind: "CLOSED" } } }),
    db.order.count({ where: { ...base, createdAt: { gte: today } } }),
    db.sale.findMany({ where: { ...saleLoc, ...saleMine, createdAt: { gte: r.from, lt: r.to } }, select: { total: true, createdAt: true } }),
    db.order.findMany({
      where: { ...base, status: { kind: "CLOSED" }, closedAt: { gte: r.prevFrom, lt: r.from } },
      select: { closedAt: true, discountPct: true, discountSum: true, items: itemSel },
    }),
    db.sale.findMany({ where: { ...saleLoc, ...saleMine, createdAt: { gte: r.prevFrom, lt: r.from } }, select: { total: true, createdAt: true } }),
  ]);

  const funnel = FUNNEL.map((f) => {
    if (f.key === "closed") return { ...f, count: closedCount, sum: closedPeriod.reduce((s, o) => s + orderSum(o), 0) };
    const list = open.filter((o) => f.kinds.includes(o.status.kind));
    return { ...f, count: list.length, sum: list.reduce((s, o) => s + orderSum(o), 0) };
  });

  const overdue = open
    .filter((o) => o.dueDate && o.dueDate < now && o.status.kind !== "READY")
    .sort((a, b) => +a.dueDate! - +b.dueDate!)
    .slice(0, 8);
  const urgent = open.filter((o) => o.urgent && o.status.kind !== "READY").slice(0, 8);

  // Сравнение «сегодня» с тем же днём прошлой недели и «период» с прошлым периодом
  const sumIn = (list: { closedAt: Date | null; items: { kind: string; qty: number; price: number; cost: number }[]; discountPct: number; discountSum: number }[], from: Date, to: Date) =>
    list.filter((o) => o.closedAt && o.closedAt >= from && o.closedAt < to).reduce((s, o) => s + orderSum(o), 0);
  const salesIn = (list: { total: number; createdAt: Date }[], from: Date, to: Date) =>
    list.filter((x) => x.createdAt >= from && x.createdAt < to).reduce((s, x) => s + x.total, 0);
  const tomorrow = new Date(today.getTime() + DAY);
  const yesterday = new Date(today.getTime() - DAY);
  const [yOrders, ySales] = await Promise.all([
    db.order.findMany({
      where: { ...base, status: { kind: "CLOSED" }, closedAt: { gte: yesterday, lt: today } },
      select: { closedAt: true, discountPct: true, discountSum: true, items: itemSel },
    }),
    db.sale.findMany({ where: { ...saleLoc, ...saleMine, createdAt: { gte: yesterday, lt: today } }, select: { total: true, createdAt: true } }),
  ]);
  const todayOrders = await db.order.findMany({
    where: { ...base, status: { kind: "CLOSED" }, closedAt: { gte: today, lt: tomorrow } },
    select: { closedAt: true, discountPct: true, discountSum: true, items: itemSel },
  });
  const todaySales = await db.sale.findMany({ where: { ...saleLoc, ...saleMine, createdAt: { gte: today, lt: tomorrow } }, select: { total: true, createdAt: true } });

  // Столбики графика: по дням (неделя, месяц) или по месяцам (год)
  const buckets: { label: string; from: Date; to: Date }[] = [];
  if (opts.period === "year") {
    for (let m = 0; m < 12; m++) {
      const from = new Date(r.from.getFullYear(), m, 1);
      buckets.push({ label: from.toLocaleDateString("ru-RU", { month: "short" }).replace(".", ""), from, to: new Date(r.from.getFullYear(), m + 1, 1) });
    }
  } else {
    for (let d = r.from; d < r.to; d = new Date(d.getTime() + DAY)) {
      const from = startOfDay(d);
      buckets.push({ label: String(from.getDate()), from, to: new Date(from.getTime() + DAY) });
    }
  }
  const chart = buckets.map((b) => ({ label: b.label, orders: sumIn(closedPeriod, b.from, b.to), sales: salesIn(sales, b.from, b.to), future: b.from > now }));

  return {
    funnel,
    todayCount,
    notIssued: open.length,
    overdue,
    urgent,
    today: {
      orders: sumIn(todayOrders, today, tomorrow),
      sales: salesIn(todaySales, today, tomorrow),
      ordersPrev: sumIn(yOrders, yesterday, today),
      salesPrev: salesIn(ySales, yesterday, today),
    },
    period: {
      orders: sumIn(closedPeriod, r.from, r.to),
      sales: salesIn(sales, r.from, r.to),
      ordersPrev: sumIn(prevClosed, r.prevFrom, r.from),
      salesPrev: salesIn(prevSales, r.prevFrom, r.from),
    },
    chart,
  };
}
