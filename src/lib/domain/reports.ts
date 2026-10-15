import type { Tenant } from "../db";
import { totals } from "./orders";

/** Сводка за период: выручка, прибыль, заказы и зарплата мастеров. */
export async function periodReport({ db }: Tenant, from: Date, to: Date, locationId?: string) {
  const loc = locationId ? { locationId } : {};
  const closedOrders = await db.order.findMany({
    where: { ...loc, closedAt: { gte: from, lt: to }, status: { kind: "CLOSED" } },
    include: { items: true, master: true },
  });
  const sales = await db.sale.findMany({ where: { ...loc, createdAt: { gte: from, lt: to } }, include: { items: true } });
  const cash = await db.cashTransaction.findMany({ where: { ...loc, createdAt: { gte: from, lt: to } } });
  const acceptedCount = await db.order.count({ where: { ...loc, createdAt: { gte: from, lt: to } } });

  let ordersRevenue = 0,
    ordersProfit = 0;
  const masters = new Map<string, { name: string; percent: number; orders: number; services: number; salary: number }>();
  for (const o of closedOrders) {
    const t = totals(o.items, 0);
    ordersRevenue += t.total;
    ordersProfit += t.profit;
    if (o.master) {
      const m = masters.get(o.master.id) ?? { name: o.master.name, percent: o.master.salaryPercent, orders: 0, services: 0, salary: 0 };
      m.orders += 1;
      m.services += t.services;
      m.salary = Math.round((m.services * m.percent) / 100);
      masters.set(o.master.id, m);
    }
  }
  const salesRevenue = sales.reduce((s, x) => s + x.total, 0);
  const salesProfit = sales.reduce((s, x) => s + x.items.reduce((a, i) => a + i.qty * (i.price - i.cost), 0), 0);
  const income = cash.filter((c) => c.amount > 0).reduce((s, c) => s + c.amount, 0);
  const expense = cash.filter((c) => c.amount < 0).reduce((s, c) => s - c.amount, 0);

  return {
    acceptedCount,
    closedCount: closedOrders.length,
    ordersRevenue,
    ordersProfit,
    salesRevenue,
    salesProfit,
    income,
    expense,
    masters: [...masters.values()].sort((a, b) => b.salary - a.salary),
  };
}
