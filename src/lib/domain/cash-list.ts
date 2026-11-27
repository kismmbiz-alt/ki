// Транзакции как в LiveSklad: фильтры, остаток кассы после каждой операции, итоги по наличным и картам.

import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/db";

export type TxFilter = { q?: string; st?: string; c?: string; u?: string; r?: string; k?: string; from?: string; to?: string };

export function txWhere(cashboxIds: string[], f: TxFilter): Prisma.CashTransactionWhereInput {
  const and: Prisma.CashTransactionWhereInput[] = [{ cashboxId: f.c && cashboxIds.includes(f.c) ? f.c : { in: cashboxIds } }];
  if (f.st === "deleted") and.push({ deletedAt: { not: null } });
  else if (f.st === "edited") and.push({ editedAt: { not: null }, deletedAt: null });
  else and.push({ deletedAt: null });
  if (f.u) and.push({ userId: f.u });
  if (f.r?.startsWith("u:")) and.push({ recipientId: f.r.slice(2) });
  if (f.r?.startsWith("s:")) and.push({ supplierId: f.r.slice(2) });
  if (f.k === "in") and.push({ amount: { gt: 0 }, transferId: null });
  if (f.k === "out") and.push({ amount: { lt: 0 }, transferId: null });
  if (f.k === "transfer") and.push({ transferId: { not: null } });
  const date: Prisma.DateTimeFilter = {};
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) date.gte = new Date(`${f.from}T00:00:00`);
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) date.lt = new Date(new Date(`${f.to}T00:00:00`).getTime() + 864e5);
  if (date.gte || date.lt) and.push({ createdAt: date });
  const q = f.q?.trim();
  if (q) {
    const n = Number(q.replace(/^[A-Za-zА-Яа-я№]+/, ""));
    and.push({
      OR: [
        { category: { contains: q, mode: "insensitive" } },
        { comment: { contains: q, mode: "insensitive" } },
        ...(Number.isInteger(n) && n > 0 ? [{ order: { number: n } }, { sale: { number: n } }] : []),
      ],
    });
  }
  return { AND: and };
}

export const TX_INCLUDE = {
  user: { select: { id: true, name: true } },
  cashbox: { select: { id: true, name: true } },
  order: { select: { id: true, number: true } },
  sale: { select: { id: true, number: true, isReturn: true } },
} as const;

/** Операции по фильтру + остаток кассы после каждой + получатели + итоги. */
export async function findTxs(db: TenantDb, cashboxIds: string[], f: TxFilter, take = 300) {
  const where = txWhere(cashboxIds, f);
  const [list, count, sums] = await Promise.all([
    db.cashTransaction.findMany({ where, include: TX_INCLUDE, orderBy: { createdAt: "desc" }, take }),
    db.cashTransaction.count({ where }),
    db.cashTransaction.groupBy({ by: ["method"], where: { AND: [where, { amount: { gt: 0 } }] }, _sum: { amount: true } }),
  ]);
  const minus = await db.cashTransaction.groupBy({ by: ["method"], where: { AND: [where, { amount: { lt: 0 } }] }, _sum: { amount: true } });
  const pick = (rows: typeof sums, cash: boolean) => rows.filter((r) => (r.method === "CASH") === cash).reduce((s, r) => s + (r._sum.amount ?? 0), 0);
  const totals = {
    cash: { in: pick(sums, true), out: pick(minus, true) },
    card: { in: pick(sums, false), out: pick(minus, false) },
  };

  // остаток кассы после операции: текущий остаток минус всё, что прошло позже
  const balanceAfter = new Map<string, number>();
  if (list.length) {
    const boxes = [...new Set(list.map((x) => x.cashboxId))];
    const oldest = list[list.length - 1].createdAt;
    const [cur, later] = await Promise.all([
      db.cashTransaction.groupBy({ by: ["cashboxId"], where: { cashboxId: { in: boxes } }, _sum: { amount: true } }),
      db.cashTransaction.findMany({ where: { cashboxId: { in: boxes }, createdAt: { gte: oldest } }, select: { id: true, cashboxId: true, amount: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    ]);
    const run = new Map(cur.map((c) => [c.cashboxId, c._sum.amount ?? 0]));
    for (const t of later) {
      const b = run.get(t.cashboxId) ?? 0;
      balanceAfter.set(t.id, b);
      run.set(t.cashboxId, b - t.amount);
    }
  }

  const [users, suppliers] = await Promise.all([
    db.user.findMany({ where: { id: { in: list.map((x) => x.recipientId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
    db.supplier.findMany({ where: { id: { in: list.map((x) => x.supplierId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
  ]);
  const docs = await db.stockDoc.findMany({ where: { id: { in: list.map((x) => x.stockDocId).filter((x): x is string => !!x) } }, select: { id: true, number: true } });
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const supName = new Map(suppliers.map((s) => [s.id, s.name]));
  const docNo = new Map(docs.map((d) => [d.id, d.number]));

  const rows = list.map((x) => ({
    ...x,
    balance: balanceAfter.get(x.id) ?? null,
    doc: x.order
      ? { href: `/orders/${x.order.id}`, label: `A${x.order.number}` }
      : x.sale
        ? { href: `/sales/${x.sale.id}`, label: `B${x.sale.number}` }
        : x.stockDocId && docNo.has(x.stockDocId)
          ? { href: `/stock/docs/${x.stockDocId}`, label: `C${docNo.get(x.stockDocId)}` }
          : null,
    recipient: x.supplierId && supName.has(x.supplierId)
      ? { href: `/stock/suppliers/${x.supplierId}`, label: supName.get(x.supplierId)! }
      : x.recipientId && userName.has(x.recipientId)
        ? { href: null, label: userName.get(x.recipientId)! }
        : null,
    shown: x.deletedAt ? (x.origAmount ?? 0) : x.amount,
  }));
  return { rows, count, totals };
}
