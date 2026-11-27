// Аналитика продаж товаров: сколько продано по группам, подгруппам и товарам.

import type { TenantDb } from "@/lib/db";
import { flattenGroups, groupPath, type GroupNode } from "./groups";

export type SaleRow = { productId: string; name: string; groupId: string | null; qty: number; revenue: number; cost: number };
export type GroupTotal = { qty: number; revenue: number; cost: number; products: number };

/** Продажи товаров за период: чеки минус возвраты, плюс запчасти в выданных заказах. Деньги в копейках. */
export async function productSales(db: TenantDb, from: Date, to: Date, opts: { locationId?: string; sales?: boolean; orders?: boolean } = {}) {
  const loc = opts.locationId ? { locationId: opts.locationId } : {};
  const map = new Map<string, SaleRow>();
  const add = (productId: string, name: string, qty: number, revenue: number, cost: number) => {
    const r = map.get(productId) ?? { productId, name, groupId: null, qty: 0, revenue: 0, cost: 0 };
    r.qty += qty;
    r.revenue += revenue;
    r.cost += cost;
    map.set(productId, r);
  };
  if (opts.sales !== false) {
    const sales = await db.sale.findMany({ where: { ...loc, createdAt: { gte: from, lt: to } }, include: { items: true } });
    for (const s of sales) {
      const gross = s.items.reduce((a, i) => a + i.qty * i.price, 0);
      // скидку на чек раскладываем по строкам пропорционально сумме
      const k = gross > 0 && s.discount > 0 ? Math.max(gross - s.discount, 0) / gross : 1;
      const sign = s.isReturn ? -1 : 1;
      for (const i of s.items) add(i.productId, i.name, sign * i.qty, sign * Math.round(i.qty * i.price * k), sign * i.qty * i.cost);
    }
  }
  if (opts.orders !== false) {
    const items = await db.orderItem.findMany({
      where: { kind: "PART", productId: { not: null }, order: { ...loc, closedAt: { gte: from, lt: to }, status: { kind: "CLOSED" } } },
    });
    for (const i of items) add(i.productId!, i.name, i.qty, i.qty * i.price, i.qty * i.cost);
  }
  const products = await db.product.findMany({ where: { id: { in: [...map.keys()] } }, select: { id: true, name: true, groupId: true } });
  for (const p of products) {
    const r = map.get(p.id)!;
    r.name = p.name;
    r.groupId = p.groupId;
  }
  return [...map.values()].filter((r) => r.qty !== 0 || r.revenue !== 0);
}

/** Итоги по каждой группе вместе со всеми её подгруппами. Ключ null — товары без группы. */
export function totalsByGroup(rows: SaleRow[], groups: GroupNode[]) {
  const totals = new Map<string | null, GroupTotal>();
  const bump = (key: string | null, r: SaleRow) => {
    const t = totals.get(key) ?? { qty: 0, revenue: 0, cost: 0, products: 0 };
    t.qty += r.qty;
    t.revenue += r.revenue;
    t.cost += r.cost;
    t.products += 1;
    totals.set(key, t);
  };
  for (const r of rows) {
    const path = groupPath(groups, r.groupId);
    if (!path.length) bump(null, r);
    for (const g of path) bump(g.id, r);
  }
  return totals;
}

/** Строки отчёта деревом: группа → подгруппа → товары, внутри уровня — по количеству. */
export function salesTree(rows: SaleRow[], groups: GroupNode[], withProducts: boolean) {
  const totals = totalsByGroup(rows, groups);
  const flat = flattenGroups(groups).filter((g) => totals.has(g.id));
  type Line = { kind: "group" | "product"; id: string; name: string; depth: number; qty: number; revenue: number; cost: number };
  const out: Line[] = [];
  const byQty = (a: { qty: number; revenue: number }, b: { qty: number; revenue: number }) => b.qty - a.qty || b.revenue - a.revenue;
  const walk = (parent: string | null, depth: number) => {
    const kids = flat.filter((g) => g.parentId === parent || (parent === null && g.depth === 0)).filter((g) => g.depth === depth);
    const sorted = kids.map((g) => ({ g, t: totals.get(g.id)! })).sort((a, b) => byQty(a.t, b.t));
    for (const { g, t } of sorted) {
      out.push({ kind: "group", id: g.id, name: g.name, depth, qty: t.qty, revenue: t.revenue, cost: t.cost });
      walk(g.id, depth + 1);
      if (withProducts)
        for (const r of rows.filter((x) => x.groupId === g.id).sort(byQty))
          out.push({ kind: "product", id: r.productId, name: r.name, depth: depth + 1, qty: r.qty, revenue: r.revenue, cost: r.cost });
    }
  };
  walk(null, 0);
  const none = totals.get(null);
  if (none) {
    out.push({ kind: "group", id: "none", name: "Без группы", depth: 0, qty: none.qty, revenue: none.revenue, cost: none.cost });
    if (withProducts)
      for (const r of rows.filter((x) => !groupPath(groups, x.groupId).length).sort(byQty))
        out.push({ kind: "product", id: r.productId, name: r.name, depth: 1, qty: r.qty, revenue: r.revenue, cost: r.cost });
  }
  return out;
}
