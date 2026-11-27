// Сводка по клиентам для раздела «Бонусы»: визиты, сумма покупок, баллы.

import type { TenantDb } from "../db";
import { bonusState } from "./bonus";

export type ClientStat = { visits: number; spent: number; lastVisit: Date | null; balance: number; available: number };

export async function clientStats(db: TenantDb, ids: string[]): Promise<Map<string, ClientStat>> {
  const out = new Map<string, ClientStat>(ids.map((id) => [id, { visits: 0, spent: 0, lastVisit: null, balance: 0, available: 0 }]));
  if (!ids.length) return out;
  const [sales, orders, pays, bonus] = await Promise.all([
    db.sale.findMany({ where: { clientId: { in: ids } }, select: { clientId: true, total: true, isReturn: true, createdAt: true } }),
    db.order.findMany({ where: { clientId: { in: ids } }, select: { clientId: true, createdAt: true } }),
    db.cashTransaction.findMany({ where: { order: { clientId: { in: ids } } }, select: { amount: true, order: { select: { clientId: true } } } }),
    db.bonusTx.findMany({ where: { clientId: { in: ids } }, select: { clientId: true, amount: true, activeFrom: true, expiresAt: true, createdAt: true } }),
  ]);
  const seen = (id: string | null, d: Date) => {
    const s = id ? out.get(id) : undefined;
    if (!s) return;
    s.visits++;
    if (!s.lastVisit || d > s.lastVisit) s.lastVisit = d;
  };
  for (const s of sales) {
    if (!s.isReturn) seen(s.clientId, s.createdAt);
    const st = s.clientId ? out.get(s.clientId) : undefined;
    if (st) st.spent += s.total;
  }
  for (const o of orders) seen(o.clientId, o.createdAt);
  for (const p of pays) {
    const st = out.get(p.order!.clientId);
    if (st) st.spent += p.amount;
  }
  const byClient = new Map<string, typeof bonus>();
  for (const b of bonus) byClient.set(b.clientId, [...(byClient.get(b.clientId) ?? []), b]);
  for (const [id, rows] of byClient) {
    const st = bonusState(rows);
    const s = out.get(id)!;
    s.balance = st.balance;
    s.available = st.available;
  }
  return out;
}
