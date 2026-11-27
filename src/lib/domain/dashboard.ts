import type { Prisma, StatusKind } from "@prisma/client";
import type { Tenant } from "../db";
import { totals } from "./orders";

export type Period = "day" | "week" | "month" | "quarter" | "year" | "custom";

const DAY = 864e5;
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export type Range = { from: Date; to: Date; prevFrom: Date; prevTo: Date; bucket: "hour" | "day" | "month" };

/**
 * Границы периода вокруг даты anchor: день, неделя (с понедельника), месяц, квартал, год.
 * Для «custom» — с from по to включительно. prev — такой же период перед ним.
 */
export function periodRange(p: Period, anchor = new Date(), custom?: { from: Date; to: Date }): Range {
  const a = startOfDay(anchor);
  if (p === "day") return { from: a, to: addDays(a, 1), prevFrom: addDays(a, -1), prevTo: a, bucket: "hour" };
  if (p === "week") {
    const from = addDays(a, -((a.getDay() + 6) % 7));
    return { from, to: addDays(from, 7), prevFrom: addDays(from, -7), prevTo: from, bucket: "day" };
  }
  if (p === "month") {
    const from = new Date(a.getFullYear(), a.getMonth(), 1);
    return { from, to: new Date(a.getFullYear(), a.getMonth() + 1, 1), prevFrom: new Date(a.getFullYear(), a.getMonth() - 1, 1), prevTo: from, bucket: "day" };
  }
  if (p === "quarter") {
    const q = Math.floor(a.getMonth() / 3) * 3;
    const from = new Date(a.getFullYear(), q, 1);
    return { from, to: new Date(a.getFullYear(), q + 3, 1), prevFrom: new Date(a.getFullYear(), q - 3, 1), prevTo: from, bucket: "day" };
  }
  if (p === "custom" && custom) {
    const from = startOfDay(custom.from);
    const to = addDays(startOfDay(custom.to), 1);
    const days = Math.max(1, Math.round((+to - +from) / DAY));
    return { from, to, prevFrom: addDays(from, -days), prevTo: from, bucket: days <= 1 ? "hour" : days <= 92 ? "day" : "month" };
  }
  const from = new Date(a.getFullYear(), 0, 1);
  return { from, to: new Date(a.getFullYear() + 1, 0, 1), prevFrom: new Date(a.getFullYear() - 1, 0, 1), prevTo: from, bucket: "month" };
}

/** План на период: месячный план, пропорционально дням периода в каждом месяце. */
export function planFor(monthly: number, from: Date, to: Date) {
  if (!monthly) return 0;
  let sum = 0;
  for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const s = Math.max(+d, +from);
    const e = Math.min(+mEnd, +to);
    if (e > s) sum += (monthly * Math.round((e - s) / DAY)) / Math.round((+mEnd - +d) / DAY);
  }
  return Math.round(sum);
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
  opts: { locationId?: string; userId?: string; mine?: boolean; range: Range },
) {
  const now = new Date();
  const today = startOfDay(now);
  const base: Prisma.OrderWhereInput = {};
  if (opts.locationId) base.locationId = opts.locationId;
  if (opts.mine && opts.userId) base.OR = [{ masterId: opts.userId }, { managerId: opts.userId }];
  const r = opts.range;
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
      where: { ...base, status: { kind: "CLOSED" }, closedAt: { gte: r.prevFrom, lt: r.prevTo } },
      select: { closedAt: true, discountPct: true, discountSum: true, items: itemSel },
    }),
    db.sale.findMany({ where: { ...saleLoc, ...saleMine, createdAt: { gte: r.prevFrom, lt: r.prevTo } }, select: { total: true, createdAt: true } }),
  ]);

  const funnel = FUNNEL.map((f) => {
    if (f.key === "closed") return { ...f, count: closedCount, sum: closedPeriod.reduce((s, o) => s + orderSum(o), 0) };
    const list = open.filter((o) => f.kinds.includes(o.status.kind));
    return { ...f, count: list.length, sum: list.reduce((s, o) => s + orderSum(o), 0) };
  });

  const inWork = open.filter((o) => o.status.kind !== "READY");
  const byDue = (a: { dueDate: Date | null }, b: { dueDate: Date | null }) => +a.dueDate! - +b.dueDate!;
  const tmr = new Date(today.getTime() + DAY);
  const after = new Date(today.getTime() + 2 * DAY);
  const overdue = inWork.filter((o) => o.dueDate && o.dueDate < now).sort(byDue);
  const dueToday = inWork.filter((o) => o.dueDate && o.dueDate >= now && o.dueDate < tmr).sort(byDue);
  const dueTomorrow = inWork.filter((o) => o.dueDate && o.dueDate >= tmr && o.dueDate < after).sort(byDue);
  const noDue = inWork.filter((o) => !o.dueDate).length;
  const urgent = inWork.filter((o) => o.urgent).slice(0, 8);
  const readyWaiting = open.filter((o) => o.status.kind === "READY").length;

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

  // Столбики графика: по часам (день), по дням (неделя, месяц, квартал) или по месяцам (год)
  const buckets: { label: string; from: Date; to: Date }[] = [];
  if (r.bucket === "month") {
    for (let d = new Date(r.from.getFullYear(), r.from.getMonth(), 1); d < r.to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      buckets.push({ label: d.toLocaleDateString("ru-RU", { month: "short" }).replace(".", ""), from: d, to: new Date(d.getFullYear(), d.getMonth() + 1, 1) });
    }
  } else if (r.bucket === "hour") {
    for (let h = 8; h < 22; h++) {
      const from = new Date(r.from.getFullYear(), r.from.getMonth(), r.from.getDate(), h === 8 ? 0 : h);
      buckets.push({ label: String(h), from, to: new Date(r.from.getFullYear(), r.from.getMonth(), r.from.getDate(), h === 21 ? 24 : h + 1) });
    }
  } else {
    for (let d = r.from; d < r.to; d = addDays(d, 1)) buckets.push({ label: String(d.getDate()), from: d, to: addDays(d, 1) });
  }
  const chart = buckets.map((b) => ({ label: b.label, orders: sumIn(closedPeriod, b.from, b.to), sales: salesIn(sales, b.from, b.to), future: b.from > now }));

  return {
    funnel,
    todayCount,
    notIssued: open.length,
    overdue,
    dueToday,
    dueTomorrow,
    noDue,
    readyWaiting,
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
      ordersPrev: sumIn(prevClosed, r.prevFrom, r.prevTo),
      salesPrev: salesIn(prevSales, r.prevFrom, r.prevTo),
      closedCount: closedPeriod.length,
    },
    chart,
  };
}
