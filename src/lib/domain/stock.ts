import type { StockMoveType } from "@prisma/client";
import type { Tenant, Tx } from "../db";
import { prisma } from "../db";
import { defaultWarehouseId } from "./places";
import { logAction } from "./log";
import { nextBarcode } from "./barcodes";
import { addCashTransaction } from "./cash";

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
  m: Place & { productId: string; qty: number; type: StockMoveType; userId?: string | null; cost?: number; comment?: string; link?: string },
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
      link: m.link ?? null,
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
async function receiveTx(tx: Tx, r: Place & { productId: string; qty: number; cost: number; userId: string; comment?: string; link?: string }) {
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
  /** Поступление от клиента, который принёс свою технику. */
  clientId?: string | null;
  userId: string;
  responsibleId?: string | null;
  inDocNo?: string | null;
  inDocDate?: Date | null;
  comment?: string | null;
  /** Для инвентаризации qty — фактический остаток, для остальных — количество. */
  items: DocItemInput[];
};

/** Новая карточка товара прямо из поступления. Цены — в копейках. */
export type NewProductInput = {
  name: string;
  groupId?: string | null;
  sku?: string | null;
  article?: string | null;
  barcode?: string | null;
  unit?: string | null;
  warrantyDays?: number | null;
  country?: string | null;
  description?: string | null;
  isSerial?: boolean;
  minQty?: number;
};

export type DocItemInput = {
  productId?: string;
  newProduct?: NewProductInput;
  qty: number;
  cost?: number;
  /** Поступление: новые цены продажи (пусто — не менять). */
  price?: number | null;
  repairPrice?: number | null;
  minPrice?: number | null;
};

/**
 * Складской документ: поступление, перемещение, списание, возврат поставщику или инвентаризация.
 * Все строки проводятся одной транзакцией: если одна не прошла, не проходит ничего.
 */
export async function createStockDoc({ db, companyId }: Tenant, d: DocInput) {
  const items = d.items.filter((i) => (i.productId || (d.type === "RECEIPT" && i.newProduct?.name?.trim())) && Number.isFinite(i.qty) && (d.type === "INVENTORY" ? i.qty >= 0 : i.qty > 0));
  if (!items.length) throw new Error("Добавьте хотя бы один товар");
  // штрихкоды новым товарам выдаём заранее: счётчик живёт вне транзакции
  const codes = new Map<DocItemInput, string>();
  for (const i of items) if (i.newProduct && !i.newProduct.barcode?.trim()) codes.set(i, await nextBarcode(companyId));
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
    if (d.clientId) await tx.client.findUniqueOrThrow({ where: { id: d.clientId } });
    if (d.responsibleId) await tx.user.findUniqueOrThrow({ where: { id: d.responsibleId } });
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
        clientId: d.type === "RECEIPT" ? d.clientId || null : null,
        userId: d.userId,
        responsibleId: d.responsibleId || d.userId,
        inDocNo: d.inDocNo || null,
        inDocDate: d.inDocDate ?? null,
        comment: d.comment || null,
      },
    });
    const label = `${DOC_LABEL[d.type]} №${number}`;
    const link = `/stock/docs/${doc.id}`;
    let total = 0;
    for (const i of items) {
      let productId = i.productId;
      if (!productId && i.newProduct) {
        const n = i.newProduct;
        if (n.groupId) await tx.productGroup.findUniqueOrThrow({ where: { id: n.groupId } });
        const created = await tx.product.create({
          data: {
            companyId,
            name: n.name.trim(),
            groupId: n.groupId || null,
            sku: n.sku || null,
            article: n.article || null,
            barcode: n.barcode?.trim() || codes.get(i) || null,
            unit: n.unit?.trim() || "шт",
            warrantyDays: n.warrantyDays ?? null,
            country: n.country || null,
            description: n.description || null,
            isSerial: !!n.isSerial,
            minQty: n.minQty ?? 0,
            price: i.price ?? 0,
            repairPrice: i.repairPrice ?? null,
            minPrice: i.minPrice ?? null,
            cost: i.cost ?? 0,
            supplierId: d.supplierId || null,
          },
        });
        productId = created.id;
      }
      const p = await tx.product.findUniqueOrThrow({ where: { id: productId } });
      let qty = i.qty;
      let cost = p.cost;
      if (d.type === "RECEIPT") {
        cost = i.cost ?? p.cost;
        await receiveTx(tx, { productId: p.id, warehouseId: wh.id, qty, cost, userId: d.userId, comment: label, link });
        const prices: { price?: number; repairPrice?: number; minPrice?: number; supplierId?: string } = {};
        if (i.price != null) prices.price = i.price;
        if (i.repairPrice != null) prices.repairPrice = i.repairPrice;
        if (i.minPrice != null) prices.minPrice = i.minPrice;
        if (d.supplierId && !p.supplierId) prices.supplierId = d.supplierId;
        if (Object.keys(prices).length) await tx.product.update({ where: { id: p.id }, data: prices });
      } else if (d.type === "WRITEOFF" || d.type === "SUPPLIER_RETURN") {
        if (d.type === "SUPPLIER_RETURN") cost = i.cost ?? p.cost;
        await moveStockTx(tx, { productId: p.id, warehouseId: wh.id, qty: -qty, type: "WRITEOFF", userId: d.userId, comment: d.comment ? `${label}: ${d.comment}` : label, link });
      } else if (d.type === "TRANSFER") {
        await moveStockTx(tx, { productId: p.id, warehouseId: wh.id, qty: -qty, type: "TRANSFER", userId: d.userId, comment: label, link });
        await moveStockTx(tx, { productId: p.id, warehouseId: to!.id, qty, type: "TRANSFER", userId: d.userId, comment: label, link });
      } else {
        const cur = await tx.stock.findFirst({ where: { productId: p.id, warehouseId: wh.id } });
        qty = i.qty - (cur?.qty ?? 0);
        if (qty === 0) continue;
        await moveStockTx(tx, { productId: p.id, warehouseId: wh.id, qty, type: "ADJUST", userId: d.userId, comment: label, link });
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

/** Сколько ещё должны поставщику (клиенту) по поступлению. */
export const docDebt = (d: { total: number; paid: number }) => Math.max(d.total - d.paid, 0);

/**
 * Оплата поступления из кассы: расход «Оплата за товар поставщику», долг по документу уменьшается.
 * amount в копейках, больше нуля.
 */
export async function payStockDoc(
  t: Tenant,
  r: { docId: string; userId: string; amount: number; cashboxId?: string | null; method: "CASH" | "CARD" | "TRANSFER" },
) {
  const { db } = t;
  const d = await db.stockDoc.findUniqueOrThrow({ where: { id: r.docId }, include: { supplier: true, client: true } });
  if (d.type !== "RECEIPT") throw new Error("Оплачивать можно только поступление");
  if (!(r.amount > 0)) throw new Error("Укажите сумму оплаты");
  if (r.amount > docDebt(d)) throw new Error(`Нельзя заплатить больше долга: ${(docDebt(d) / 100).toLocaleString("ru-RU")} ₽`);
  const who = d.supplier?.name ?? d.client?.name;
  await addCashTransaction(t, {
    locationId: d.locationId,
    cashboxId: r.cashboxId,
    userId: r.userId,
    amount: -r.amount,
    method: r.method,
    category: d.clientId ? "Выкуп техники" : "Оплата за товар поставщику",
    comment: `Поступление №${d.number}${who ? `, ${who}` : ""}`,
  });
  return db.stockDoc.update({ where: { id: d.id }, data: { paid: { increment: r.amount } } });
}
