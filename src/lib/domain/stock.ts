import type { StockMoveType } from "@prisma/client";
import type { Tenant, Tx } from "../db";
import { prisma } from "../db";
import { defaultWarehouseId } from "./places";
import { logAction } from "./log";

type Place = { warehouseId?: string | null; locationId?: string | null };

/** Склад движения: указанный или склад по умолчанию в точке. */
async function warehouseOf(tx: Tx, p: Place) {
  if (p.warehouseId) {
    const w = await tx.warehouse.findUniqueOrThrow({ where: { id: p.warehouseId } });
    if (p.locationId && w.locationId !== p.locationId) throw new Error(`Склад «${w.name}» относится к другой точке`);
    return w;
  }
  if (!p.locationId) throw new Error("Не выбран склад");
  return tx.warehouse.findUniqueOrThrow({ where: { id: await defaultWarehouseId(tx, p.locationId) } });
}

/** Движение товара на складе. Не даёт уйти в минус. */
export async function moveStockTx(
  tx: Tx,
  m: Place & { productId: string; qty: number; type: StockMoveType; userId?: string | null; cost?: number; comment?: string },
) {
  const product = await tx.product.findUniqueOrThrow({ where: { id: m.productId } });
  const companyId = product.companyId;
  const wh = await warehouseOf(tx, m);
  const stock = await tx.stock.upsert({
    where: { companyId_productId_warehouseId: { companyId, productId: m.productId, warehouseId: wh.id } },
    create: { companyId, productId: m.productId, locationId: wh.locationId, warehouseId: wh.id, qty: 0 },
    update: {},
  });
  const newQty = stock.qty + m.qty;
  if (newQty < 0) throw new Error(`Недостаточно «${product.name}» на складе «${wh.name}»: есть ${stock.qty}, нужно ${-m.qty}`);
  // защита от гонки: обновляем, только если остаток не изменился
  const res = await tx.stock.updateMany({ where: { id: stock.id, qty: stock.qty }, data: { qty: newQty } });
  if (res.count !== 1) throw new Error("Остаток изменился, повторите операцию");
  await tx.stockMove.create({
    data: {
      companyId,
      productId: m.productId,
      locationId: wh.locationId,
      warehouseId: wh.id,
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
  r: Place & { productId: string; qty: number; cost: number; userId: string; comment?: string },
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
  r: Place & { productId: string; qty: number; userId: string },
) {
  if (r.qty < 0) throw new Error("Остаток не может быть отрицательным");
  return db.$transaction(async (tx) => {
    const wh = await warehouseOf(tx, r);
    const cur = await tx.stock.findFirst({ where: { productId: r.productId, warehouseId: wh.id } });
    const diff = r.qty - (cur?.qty ?? 0);
    if (diff === 0) return;
    await moveStockTx(tx, { productId: r.productId, warehouseId: wh.id, qty: diff, type: "ADJUST", userId: r.userId, comment: "Инвентаризация" });
  });
}

/** Приход внутри транзакции: пересчёт средней закупочной + движение. */
async function receiveTx(tx: Tx, r: Place & { productId: string; qty: number; cost: number; userId: string; comment?: string }) {
  const product = await tx.product.findUniqueOrThrow({ where: { id: r.productId } });
  const totalAgg = await tx.stock.aggregate({ where: { productId: r.productId }, _sum: { qty: true } });
  const have = Math.max(totalAgg._sum.qty ?? 0, 0);
  const avg = have + r.qty > 0 ? Math.round((have * product.cost + r.qty * r.cost) / (have + r.qty)) : r.cost;
  await tx.product.update({ where: { id: r.productId }, data: { cost: avg } });
  await moveStockTx(tx, { ...r, type: "RECEIPT" });
  return product;
}

export const DOC_LABEL = {
  RECEIPT: "Поступление",
  TRANSFER: "Перемещение",
  WRITEOFF: "Списание",
  INVENTORY: "Инвентаризация",
  SUPPLIER_RETURN: "Возврат поставщику",
} as const;

export type DocInput = {
  type: keyof typeof DOC_LABEL;
  /** Склад документа (для перемещения — откуда). Если не указан — склад по умолчанию в точке locationId. */
  warehouseId?: string | null;
  locationId?: string | null;
  toWarehouseId?: string | null;
  /** Перемещение в другую точку: склад по умолчанию этой точки. */
  toLocationId?: string | null;
  supplierId?: string | null;
  userId: string;
  comment?: string | null;
  /** Для инвентаризации qty — фактический остаток, для остальных — количество. */
  items: { productId: string; qty: number; cost?: number }[];
};

/**
 * Складской документ: поступление, перемещение, списание, возврат поставщику или инвентаризация.
 * Все строки проводятся одной транзакцией: если одна не прошла, не проходит ничего.
 */
export async function createStockDoc({ db, companyId }: Tenant, d: DocInput) {
  const items = d.items.filter((i) => i.productId && Number.isFinite(i.qty) && (d.type === "INVENTORY" ? i.qty >= 0 : i.qty > 0));
  if (!items.length) throw new Error("Добавьте хотя бы один товар");
  return db.$transaction(async (tx) => {
    const wh = await warehouseOf(tx, d);
    let to: Awaited<ReturnType<typeof warehouseOf>> | null = null;
    if (d.type === "TRANSFER") {
      const toId = d.toWarehouseId || (d.toLocationId ? await defaultWarehouseId(tx, d.toLocationId) : null);
      if (!toId) throw new Error("Выберите склад, куда перемещаем");
      to = await tx.warehouse.findUniqueOrThrow({ where: { id: toId } });
      if (to.id === wh.id) throw new Error("Склады отправления и назначения совпадают");
    }
    if (d.supplierId) await tx.supplier.findUniqueOrThrow({ where: { id: d.supplierId } });
    const { docSeq: number } = await prisma.company.update({ where: { id: companyId }, data: { docSeq: { increment: 1 } }, select: { docSeq: true } });
    const doc = await tx.stockDoc.create({
      data: {
        companyId,
        number,
        type: d.type,
        locationId: wh.locationId,
        warehouseId: wh.id,
        toLocationId: to?.locationId ?? null,
        toWarehouseId: to?.id ?? null,
        supplierId: d.type === "RECEIPT" || d.type === "SUPPLIER_RETURN" ? d.supplierId || null : null,
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
        await receiveTx(tx, { productId: p.id, warehouseId: wh.id, qty, cost, userId: d.userId, comment: label });
        if (d.supplierId && !p.supplierId) await tx.product.update({ where: { id: p.id }, data: { supplierId: d.supplierId } });
      } else if (d.type === "WRITEOFF" || d.type === "SUPPLIER_RETURN") {
        if (d.type === "SUPPLIER_RETURN") cost = i.cost ?? p.cost;
        await moveStockTx(tx, { productId: p.id, warehouseId: wh.id, qty: -qty, type: "WRITEOFF", userId: d.userId, comment: d.comment ? `${label}: ${d.comment}` : label });
      } else if (d.type === "TRANSFER") {
        await moveStockTx(tx, { productId: p.id, warehouseId: wh.id, qty: -qty, type: "TRANSFER", userId: d.userId, comment: label });
        await moveStockTx(tx, { productId: p.id, warehouseId: to!.id, qty, type: "TRANSFER", userId: d.userId, comment: label });
      } else {
        const cur = await tx.stock.findFirst({ where: { productId: p.id, warehouseId: wh.id } });
        qty = i.qty - (cur?.qty ?? 0);
        if (qty === 0) continue;
        await moveStockTx(tx, { productId: p.id, warehouseId: wh.id, qty, type: "ADJUST", userId: d.userId, comment: label });
      }
      total += qty * cost;
      await tx.stockDocItem.create({ data: { companyId, docId: doc.id, productId: p.id, name: p.name, qty, cost } });
    }
    await logAction(tx, {
      companyId,
      userId: d.userId,
      locationId: wh.locationId,
      kind: "stock",
      text: `${label}: склад «${wh.name}»${to ? ` → «${to.name}»` : ""}, позиций ${items.length}`,
      amount: total || null,
      link: `/stock/docs/${doc.id}`,
    });
    return tx.stockDoc.update({ where: { id: doc.id }, data: { total } });
  });
}
