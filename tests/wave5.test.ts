import { beforeAll, describe, expect, it } from "vitest";
import { execSync } from "child_process";
import { tenant } from "@/lib/db";
import { createCompany } from "@/lib/domain/company";
import { createSale, returnSale } from "@/lib/domain/sales";
import { receiveStock } from "@/lib/domain/stock";
import { canNest, flattenGroups, groupPath, indentLabel, withDescendants } from "@/lib/domain/groups";
import { markupPrice } from "@/lib/domain/markup";
import { productSales, salesTree, totalsByGroup } from "@/lib/domain/product-sales";

const uniq = () => Math.random().toString(36).slice(2, 8);

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: process.env, stdio: "ignore" });
});

const G = [
  { id: "ip", name: "iPhone", parentId: null },
  { id: "ip13", name: "iPhone 13", parentId: "ip" },
  { id: "ip11", name: "iPhone 11", parentId: "ip" },
  { id: "acc", name: "Аксессуары", parentId: null },
];

describe("группы и подгруппы", () => {
  it("дерево по порядку, обычным текстом", () => {
    expect(flattenGroups(G).map((g) => [g.name, g.depth])).toEqual([
      ["iPhone", 0],
      ["iPhone 11", 1],
      ["iPhone 13", 1],
      ["Аксессуары", 0],
    ]);
    expect(flattenGroups(G)[0].hasChildren).toBe(true);
    expect(indentLabel("iPhone 13", 1)).not.toContain("—");
  });
  it("подгруппы, путь и защита от петель", () => {
    expect(withDescendants(G, "ip").sort()).toEqual(["ip", "ip11", "ip13"]);
    expect(groupPath(G, "ip13").map((g) => g.name)).toEqual(["iPhone", "iPhone 13"]);
    expect(canNest(G, "ip", "ip13")).toBe(false);
    expect(canNest(G, "ip13", "acc")).toBe(true);
  });
});

describe("наценка", () => {
  it("процент, рубли и округление вверх", () => {
    expect(markupPrice(10000, 50)).toBe(15000);
    expect(markupPrice(10000, 30, 5000, 10000)).toBe(20000);
    expect(markupPrice(12345, 0, 0, 1000)).toBe(13000);
  });
});

describe("аналитика продаж по группам", () => {
  it("продажи минус возвраты, итоги по группе вместе с подгруппами", async () => {
    const a = await createCompany({ companyName: "Склад", ownerName: "Кирилл", email: `s-${uniq()}@test.ru`, password: "password123" });
    const t = tenant(a.company.id);
    const ip = await t.db.productGroup.create({ data: { companyId: a.company.id, name: "iPhone" } });
    const ip13 = await t.db.productGroup.create({ data: { companyId: a.company.id, name: "iPhone 13", parentId: ip.id } });
    const p1 = await t.db.product.create({ data: { companyId: a.company.id, name: "iPhone 13 128 Black", price: 4000000, groupId: ip13.id } });
    const p2 = await t.db.product.create({ data: { companyId: a.company.id, name: "Стекло", price: 50000 } });
    await receiveStock(t, { productId: p1.id, locationId: a.location.id, qty: 5, cost: 3000000, userId: a.owner.id });
    await receiveStock(t, { productId: p2.id, locationId: a.location.id, qty: 5, cost: 10000, userId: a.owner.id });
    const sale = await createSale(t, { locationId: a.location.id, userId: a.owner.id, method: "CASH", items: [{ productId: p1.id, qty: 3 }, { productId: p2.id, qty: 1 }] });
    const it1 = await t.db.saleItem.findFirstOrThrow({ where: { saleId: sale.id, productId: p1.id } });
    await returnSale(t, { saleId: sale.id, userId: a.owner.id, method: "CASH", items: [{ saleItemId: it1.id, qty: 1 }] });

    const rows = await productSales(t.db, new Date(Date.now() - 864e5), new Date(Date.now() + 864e5));
    const r1 = rows.find((r) => r.productId === p1.id)!;
    expect(r1.qty).toBe(2);
    expect(r1.revenue).toBe(8000000);
    expect(r1.cost).toBe(6000000);
    const groups = await t.db.productGroup.findMany();
    const totals = totalsByGroup(rows, groups);
    expect(totals.get(ip.id)?.qty).toBe(2);
    expect(totals.get(null)?.qty).toBe(1);
    const tree = salesTree(rows, groups, true);
    expect(tree.map((l) => [l.kind, l.name, l.depth])).toEqual([
      ["group", "iPhone", 0],
      ["group", "iPhone 13", 1],
      ["product", "iPhone 13 128 Black", 2],
      ["group", "Без группы", 0],
      ["product", "Стекло", 1],
    ]);
  });
});
