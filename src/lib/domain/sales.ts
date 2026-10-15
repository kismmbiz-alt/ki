import type { Tenant } from "../db";
import { prisma } from "../db";
import { moveStockTx } from "./stock";

/** Продажа товара без заказа: списание со склада точки и приход в кассу. */
export async function createSale(
  { db, companyId }: Tenant,
  s: {
    locationId: string;
    userId: string;
    clientId?: string | null;
    method: "CASH" | "CARD" | "TRANSFER";
    items: { productId: string; qty: number; price?: number }[];
  },
) {
  const items = s.items.filter((i) => i.qty > 0);
  if (!items.length) throw new Error("Добавьте хотя бы один товар");
  return db.$transaction(async (tx) => {
    const { saleSeq: number } = await prisma.company.update({
      where: { id: companyId },
      data: { saleSeq: { increment: 1 } },
      select: { saleSeq: true },
    });
    const rows = [];
    for (const i of items) {
      const p = await tx.product.findUniqueOrThrow({ where: { id: i.productId } });
      rows.push({ productId: p.id, name: p.name, qty: i.qty, price: i.price ?? p.price, cost: p.cost });
    }
    const total = rows.reduce((sum, r) => sum + r.qty * r.price, 0);
    const sale = await tx.sale.create({
      data: { companyId, locationId: s.locationId, number, clientId: s.clientId || null, userId: s.userId, total },
    });
    for (const r of rows) {
      await tx.saleItem.create({ data: { companyId, saleId: sale.id, ...r } });
      await moveStockTx(tx, {
        productId: r.productId,
        locationId: s.locationId,
        qty: -r.qty,
        type: "SALE",
        userId: s.userId,
        comment: `Продажа №${number}`,
      });
    }
    await tx.cashTransaction.create({
      data: {
        companyId,
        locationId: s.locationId,
        userId: s.userId,
        saleId: sale.id,
        amount: total,
        method: s.method,
        category: "Продажа",
        comment: `Продажа №${number}`,
      },
    });
    return sale;
  });
}
