import { beforeAll, describe, expect, it } from "vitest";
import { execSync } from "child_process";
import { tenant } from "@/lib/db";
import { createCompany } from "@/lib/domain/company";
import { createSale, returnSale } from "@/lib/domain/sales";
import { receiveStock } from "@/lib/domain/stock";
import { saleTiles } from "@/lib/domain/sale-tiles";

const uniq = () => Math.random().toString(36).slice(2, 8);
beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: process.env, stdio: "ignore" });
});

describe("продажа: скидки и работы", () => {
  it("скидка на позицию и на чек, предел по должности, работа без остатка", async () => {
    const a = await createCompany({ companyName: "Скидки", ownerName: "Кирилл", email: `d-${uniq()}@test.ru`, password: "password123" });
    const t = tenant(a.company.id);
    const glass = await t.db.product.create({ data: { companyId: a.company.id, name: "Стекло", price: 100000, minPrice: 70000 } });
    const consult = await t.db.product.create({ data: { companyId: a.company.id, name: "Консультация", price: 50000, isService: true } });
    await receiveStock(t, { productId: glass.id, locationId: a.location.id, qty: 5, cost: 30000, userId: a.owner.id });
    const base = { locationId: a.location.id, userId: a.owner.id, method: "CASH" as const };

    // работа продаётся без остатка и не создаёт движений склада
    const s = await createSale(t, { ...base, discount: 10000, items: [
      { productId: glass.id, qty: 2, price: 100000, discount: 20000 }, // −100 ₽ за штуку
      { productId: consult.id, qty: 1 },
    ] });
    expect(s.total).toBe(2 * 90000 + 50000 - 10000);
    const items = await t.db.saleItem.findMany({ where: { saleId: s.id }, orderBy: { name: "asc" } });
    expect(items.map((i) => [i.name, i.price, i.discount])).toEqual([["Консультация", 50000, 0], ["Стекло", 90000, 10000]]);
    expect(await t.db.stock.count({ where: { productId: consult.id } })).toBe(0);
    expect((await t.db.stock.findFirstOrThrow({ where: { productId: glass.id } })).qty).toBe(3);

    // цена со скидкой ниже минимальной — нельзя
    await expect(createSale(t, { ...base, items: [{ productId: glass.id, qty: 1, price: 100000, discount: 40000 }] })).rejects.toThrow(/ниже минимальной/);
    // предел скидки должности: 10%
    await expect(createSale(t, { ...base, maxDiscountPct: 10, discount: 15000, items: [{ productId: glass.id, qty: 1, price: 100000 }] })).rejects.toThrow(/больше разрешённой/);
    await createSale(t, { ...base, maxDiscountPct: 10, discount: 10000, items: [{ productId: glass.id, qty: 1, price: 100000 }] });

    // возврат работы не кладёт её на склад
    const ci = items.find((i) => i.productId === consult.id)!;
    await returnSale(t, { saleId: s.id, userId: a.owner.id, method: "CASH", items: [{ saleItemId: ci.id, qty: 1 }] });
    expect(await t.db.stock.count({ where: { productId: consult.id } })).toBe(0);

    // работа на плитке всегда доступна
    await t.db.saleTile.create({ data: { companyId: a.company.id, side: "PRIORITY", slot: 0, productId: consult.id } });
    const tl = await saleTiles(t.db, new Set([consult.id]));
    expect(tl.priority[0]).toBe(consult.id);
  });
});
