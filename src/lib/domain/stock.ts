import type { StockMoveType } from "@prisma/client";
import type { Tenant, Tx } from "../db";

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
