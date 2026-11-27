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

import { createStockDoc, docDebt, parseSerials, payStockDoc } from "@/lib/domain/stock";
import { findDocs } from "@/lib/domain/stock-docs";
import { parseImport } from "@/components/receipt-form";

describe("поступление как в LiveSklad", () => {
  it("новая карточка товара с ценами, клиент-источник, частичная оплата и долг", async () => {
    const a = await createCompany({ companyName: "Приход", ownerName: "Кирилл", email: `r-${uniq()}@test.ru`, password: "password123" });
    const t = tenant(a.company.id);
    const grp = await t.db.productGroup.create({ data: { companyId: a.company.id, name: "iPhone 13" } });
    const old = await t.db.product.create({ data: { companyId: a.company.id, name: "Стекло", price: 50000 } });
    const client = await t.db.client.create({ data: { companyId: a.company.id, name: "Иван", phone: "+79000000001" } });
    const doc = await createStockDoc(t, {
      type: "RECEIPT",
      locationId: a.location.id,
      clientId: client.id,
      userId: a.owner.id,
      inDocNo: "Н-15",
      items: [
        { newProduct: { name: "iPhone 13 128GB Midnight", groupId: grp.id, description: "128 ГБ, чёрный, АКБ 89%", isSerial: true, warrantyDays: 30 }, qty: 1, cost: 3000000, price: 4200000, minPrice: 3900000, serials: ["356938035643809"] },
        { productId: old.id, qty: 10, cost: 5000, price: 60000 },
      ],
    });
    expect(doc.total).toBe(3000000 + 50000);
    expect(doc.clientId).toBe(client.id);
    const np = await t.db.product.findFirstOrThrow({ where: { name: "iPhone 13 128GB Midnight" } });
    expect(np).toMatchObject({ groupId: grp.id, price: 4200000, minPrice: 3900000, cost: 3000000, isSerial: true, warrantyDays: 30 });
    expect(np.barcode).toHaveLength(13);
    expect((await t.db.product.findUniqueOrThrow({ where: { id: old.id } })).price).toBe(60000);
    expect((await t.db.stock.findFirstOrThrow({ where: { productId: np.id } })).qty).toBe(1);

    await payStockDoc(t, { docId: doc.id, userId: a.owner.id, amount: 1000000, method: "CASH" });
    const after = await t.db.stockDoc.findUniqueOrThrow({ where: { id: doc.id } });
    expect(docDebt(after)).toBe(2050000);
    await expect(payStockDoc(t, { docId: doc.id, userId: a.owner.id, amount: 9000000, method: "CASH" })).rejects.toThrow(/больше долга/);
    const cash = await t.db.cashTransaction.findFirstOrThrow({ where: { comment: { startsWith: `Поступление №${doc.number}` } } });
    expect(cash.amount).toBe(-1000000);
    expect(cash.category).toBe("Выкуп техники");
    const it0 = await t.db.stockDocItem.findFirstOrThrow({ where: { docId: doc.id, productId: np.id } });
    expect(it0.serials).toBe("356938035643809");
    const move = await t.db.stockMove.findFirstOrThrow({ where: { productId: np.id } });
    expect(move.link).toBe(`/stock/docs/${doc.id}`);
  });

  it("серийный товар без IMEI не проводится; фильтры списка документов; загрузка из Excel", async () => {
    const a = await createCompany({ companyName: "Приход2", ownerName: "Кирилл", email: `r2-${uniq()}@test.ru`, password: "password123" });
    const t = tenant(a.company.id);
    const ph = await t.db.product.create({ data: { companyId: a.company.id, name: "iPhone 12", isSerial: true, price: 0 } });
    const sup = await t.db.supplier.create({ data: { companyId: a.company.id, name: "ГринСпарк" } });
    await expect(createStockDoc(t, { type: "RECEIPT", locationId: a.location.id, userId: a.owner.id, items: [{ productId: ph.id, qty: 2, cost: 100, serials: ["111"] }] })).rejects.toThrow(/серийный товар/);
    expect(parseSerials("111, 222\n222 333")).toEqual(["111", "222", "333"]);
    const doc = await createStockDoc(t, { type: "RECEIPT", locationId: a.location.id, supplierId: sup.id, userId: a.owner.id, items: [{ productId: ph.id, qty: 2, cost: 100, serials: ["111", "222"] }] });
    const ids = async (f: Parameters<typeof findDocs>[3]) => (await findDocs(t.db, ["RECEIPT"], a.location.id, f)).map((d) => d.id);
    expect(await ids({ q: "гринспарк" })).toEqual([doc.id]);
    expect(await ids({ q: String(doc.number) })).toEqual([doc.id]);
    expect(await ids({ q: "iphone 12" })).toEqual([doc.id]);
    expect(await ids({ q: "нет такого" })).toEqual([]);
    expect(await ids({ from: "2000-01-01", to: "2000-01-02" })).toEqual([]);
    expect(parseImport("Наименование\tКол-во\tЗакупка\niPhone 12\t2\t1 500\t3000\nАКБ;5;800")).toEqual([
      { key: "iPhone 12", qty: "2", cost: "1500", price: "3000" },
      { key: "АКБ", qty: "5", cost: "800", price: "" },
    ]);
  });
});

import { bonusState, maskPhone, refreshBonus } from "@/lib/domain/bonus";
import { prisma } from "@/lib/db";

describe("бонусная система", () => {
  it("сгорание по сроку: сначала тратятся баллы, которые сгорят раньше", () => {
    const now = new Date("2026-12-01");
    const d = (s: string) => new Date(s);
    const st = bonusState(
      [
        { amount: 10000, activeFrom: d("2026-10-01"), expiresAt: d("2026-11-01"), createdAt: d("2026-10-01") },
        { amount: 5000, activeFrom: d("2026-11-20"), expiresAt: d("2027-01-01"), createdAt: d("2026-11-20") },
        { amount: 3000, activeFrom: d("2026-12-10"), expiresAt: null, createdAt: d("2026-11-30") },
        { amount: -4000, activeFrom: d("2026-10-10"), expiresAt: null, createdAt: d("2026-10-10") },
      ],
      now,
    );
    expect(st.toExpire).toBe(6000);
    expect(st.balance).toBe(8000);
    expect(st.available).toBe(5000);
    expect(maskPhone("+79001234567")).toBe("+7••••••••67");
  });

  it("продажа: оплата баллами, начисление, возврат отменяет начисление и возвращает баллы", async () => {
    const a = await createCompany({ companyName: "Бонусы", ownerName: "Кирилл", email: `b-${uniq()}@test.ru`, password: "password123" });
    await prisma.company.update({ where: { id: a.company.id }, data: { bonusEnabled: true, bonusSalePct: 500, bonusMaxPayPct: 5000 } });
    const t = tenant(a.company.id);
    const p = await t.db.product.create({ data: { companyId: a.company.id, name: "Чехол", price: 100000 } });
    await receiveStock(t, { productId: p.id, locationId: a.location.id, qty: 10, cost: 20000, userId: a.owner.id });
    const s1 = await createSale(t, { locationId: a.location.id, userId: a.owner.id, method: "CASH", client: { phone: "89005550011", name: "Аня" }, items: [{ productId: p.id, qty: 2 }] });
    const clientId = s1.clientId!;
    expect((await refreshBonus(t.db, a.company.id, clientId)).available).toBe(10000); // 5% от 2000 ₽

    await expect(createSale(t, { locationId: a.location.id, userId: a.owner.id, method: "CASH", clientId, bonusPay: 20000, items: [{ productId: p.id, qty: 1 }] })).rejects.toThrow(/доступно только/);
    const s2 = await createSale(t, { locationId: a.location.id, userId: a.owner.id, method: "CASH", clientId, bonusPay: 10000, items: [{ productId: p.id, qty: 1 }] });
    expect(s2.bonusPaid).toBe(10000);
    const cash = await t.db.cashTransaction.findFirstOrThrow({ where: { saleId: s2.id } });
    expect(cash.amount).toBe(90000);
    // начислено 5% от 900 ₽ = 45 баллов
    expect((await refreshBonus(t.db, a.company.id, clientId)).balance).toBe(4500);

    const it2 = await t.db.saleItem.findFirstOrThrow({ where: { saleId: s2.id } });
    const ret = await returnSale(t, { saleId: s2.id, userId: a.owner.id, method: "CASH", items: [{ saleItemId: it2.id, qty: 1 }] });
    expect(ret.bonusPaid).toBe(10000);
    expect((await t.db.cashTransaction.findFirstOrThrow({ where: { saleId: ret.id } })).amount).toBe(-90000);
    expect((await refreshBonus(t.db, a.company.id, clientId)).balance).toBe(10000);
  });
});
