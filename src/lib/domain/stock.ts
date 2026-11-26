import type { StockMoveType } from "@prisma/client";
import type { Tenant, Tx } from "../db";
import { prisma } from "../db";

/** Движение товара на складе точки. Не даёт уйти в минус. */
export async function moveStockTx(
  tx: Tx,
  m: { productId: string; locationId: string; qty: number; type: StockMoveType; userId?: string | null; cost?: number; comment?: string },
) {
  const product = await tx.product.findUniqueOrThrow({ where: { id: m.productId } });
  const companyId = product.companyId;
  const stock = await tx.stock.upsert({
    where: { companyId_productId_locationId: { companyId, productId: m.productId, locationId: m.locationId } },
    create: { companyId, productId: m.productId, locationId: m.locationId, qty: 0 },
    update: {},
  });
  const newQty = stock.qty + m.qty;
  if (newQty < 0) throw new Error(`Недостаточно «${product.name}» на складе: есть ${stock.qty}, нужно ${-m.qty}`);
  // защита от гонки: обновляем, только если остаток не изменился
  const res = await tx.stock.updateMany({ where: { id: stock.id, qty: stock.qty }, data: { qty: newQty } });
  if (res.count !== 1) throw new Error("Остаток изменился, повторите операцию");
  await tx.stockMove.create({
    data: {
      companyId,
      productId: m.productId,
      locationId: m.locationId,
      userId: m.userId ?? null,
      type: m.type,
      qty: m.qty,
      cost: m.cost ?? 0,
      comment: m.comment ?? null,
    },
  });
  return newQty;
}

/** Приход товара от поставщика. Пересчитывает среднюю закупочную цену. */
export async function receiveStock(
  { db }: Tenant,
  r: { productId: string; locationId: string; qty: number; cost: number; userId: string; comment?: string },
) {
  if (r.qty <= 0) throw new Error("Количество должно быть больше нуля");
  return db.$transaction(async (tx) => {
    const product = await tx.product.findUniqueOrThrow({ where: { id: r.productId } });
    const totalAgg = await tx.stock.aggregate({ where: { productId: r.productId }, _sum: { qty: true } });
    const have = Math.max(totalAgg._sum.qty ?? 0, 0);
    const avg = have + r.qty > 0 ? Math.round((have * product.cost + r.qty * r.cost) / (have + r.qty)) : r.cost;
    await tx.product.update({ where: { id: r.productId }, data: { cost: avg } });
    await moveStockTx(tx, { ...r, type: "RECEIPT", comment: r.comment || "Приход" });
  });
}

/** Корректировка по инвентаризации: ставит фактический остаток. */
export async function setStock(
  { db }: Tenant,
  r: { productId: string; locationId: string; qty: number; userId: string },
) {
  if (r.qty < 0) throw new Error("Остаток не может быть отрицательным");
  return db.$transaction(async (tx) => {
    const cur = await tx.stock.findFirst({ where: { productId: r.productId, locationId: r.locationId } });
    const diff = r.qty - (cur?.qty ?? 0);
    if (diff === 0) return;
    await moveStockTx(tx, { productId: r.productId, locationId: r.locationId, qty: diff, type: "ADJUST", userId: r.userId, comment: "Инвентаризация" });
  });
}

/** Приход внутри транзакции: пересчёт средней закупочной + движение. */
async function receiveTx(tx: Tx, r: { productId: string; locationId: string; qty: number; cost: number; userId: string; comment?: string }) {
  const product = await tx.product.findUniqueOrThrow({ where: { id: r.productId } });
  const totalAgg = await tx.stock.aggregate({ where: { productId: r.productId }, _sum: { qty: true } });
  const have = Math.max(totalAgg._sum.qty ?? 0, 0);
  const avg = have + r.qty > 0 ? Math.round((have * product.cost + r.qty * r.cost) / (have + r.qty)) : r.cost;
  await tx.product.update({ where: { id: r.productId }, data: { cost: avg } });
  await moveStockTx(tx, { ...r, type: "RECEIPT" });
  return product;
}

export const DOC_LABEL = { RECEIPT: "Оприходование", TRANSFER: "Перемещение", WRITEOFF: "Списание", INVENTORY: "Инвентаризация" } as const;

export type DocInput = {
  type: keyof typeof DOC_LABEL;
  locationId: string;
  toLocationId?: string | null;
  supplierId?: string | null;
  userId: string;
  comment?: string | null;
  /** Для инвентаризации qty — фактический остаток, для остальных — количество. */
  items: { productId: string; qty: number; cost?: number }[];
};

/**
 * Складской документ: оприходование, перемещение, списание или инвентаризация.
 * Все строки проводятся одной транзакцией: если одна не прошла, не проходит ничего.
 */
export async function createStockDoc({ db, companyId }: Tenant, d: DocInput) {
  const items = d.items.filter((i) => i.productId && Number.isFinite(i.qty) && (d.type === "INVENTORY" ? i.qty >= 0 : i.qty > 0));
  if (!items.length) throw new Error("Добавьте хотя бы один товар");
  if (d.type === "TRANSFER") {
    if (!d.toLocationId) throw new Error("Выберите точку, куда перемещаем");
    if (d.toLocationId === d.locationId) throw new Error("Точки отправления и назначения совпадают");
  }
  return db.$transaction(async (tx) => {
    if (d.toLocationId) await tx.location.findUniqueOrThrow({ where: { id: d.toLocationId } });
    if (d.supplierId) await tx.supplier.findUniqueOrThrow({ where: { id: d.supplierId } });
    const { docSeq: number } = await prisma.company.update({ where: { id: companyId }, data: { docSeq: { increment: 1 } }, select: { docSeq: true } });
    const doc = await tx.stockDoc.create({
      data: {
        companyId,
        number,
        type: d.type,
        locationId: d.locationId,
        toLocationId: d.type === "TRANSFER" ? d.toLocationId : null,
        supplierId: d.type === "RECEIPT" ? d.supplierId || null : null,
        userId: d.userId,
        comment: d.comment || null,
      },
    });
    const label = `${DOC_LABEL[d.type]} №${number}`;
    let total = 0;
    for (const i of items) {
      const p = await tx.product.findUniqueOrThrow({ where: { id: i.productId } });
      let qty = i.qty;
      let cost = p.cost;
      if (d.type === "RECEIPT") {
        cost = i.cost ?? p.cost;
        await receiveTx(tx, { productId: p.id, locationId: d.locationId, qty, cost, userId: d.userId, comment: label });
        if (d.supplierId && !p.supplierId) await tx.product.update({ where: { id: p.id }, data: { supplierId: d.supplierId } });
      } else if (d.type === "WRITEOFF") {
        await moveStockTx(tx, { productId: p.id, locationId: d.locationId, qty: -qty, type: "WRITEOFF", userId: d.userId, comment: d.comment ? `${label}: ${d.comment}` : label });
      } else if (d.type === "TRANSFER") {
        await moveStockTx(tx, { productId: p.id, locationId: d.locationId, qty: -qty, type: "TRANSFER", userId: d.userId, comment: label });
        await moveStockTx(tx, { productId: p.id, locationId: d.toLocationId!, qty, type: "TRANSFER", userId: d.userId, comment: label });
      } else {
        const cur = await tx.stock.findFirst({ where: { productId: p.id, locationId: d.locationId } });
        qty = i.qty - (cur?.qty ?? 0);
        if (qty === 0) continue;
        await moveStockTx(tx, { productId: p.id, locationId: d.locationId, qty, type: "ADJUST", userId: d.userId, comment: label });
      }
      total += qty * cost;
      await tx.stockDocItem.create({ data: { companyId, docId: doc.id, productId: p.id, name: p.name, qty, cost } });
    }
    return tx.stockDoc.update({ where: { id: doc.id }, data: { total } });
  });
}
