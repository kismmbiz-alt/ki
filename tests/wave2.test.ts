import { beforeAll, describe, expect, it } from "vitest";
import { execSync } from "child_process";
import ExcelJS from "exceljs";
import { tenant } from "@/lib/db";
import { createCompany } from "@/lib/domain/company";
import { createOrder, issueOrder, addService, setDiscount, orderTotals } from "@/lib/domain/orders";
import { createStockDoc } from "@/lib/domain/stock";
import { cashOnHand, closeShift, createSale, openShift, returnSale } from "@/lib/domain/sales";
import { importClients, importProducts, readTable } from "@/lib/domain/import";

const uniq = () => Math.random().toString(36).slice(2, 8);

async function setup() {
  const a = await createCompany({ companyName: "А", ownerName: "Кирилл", email: `w2-${uniq()}@test.ru`, password: "password123" });
  const b = await createCompany({ companyName: "Б", ownerName: "Коллега", email: `w2b-${uniq()}@test.ru`, password: "password123" });
  const ta = tenant(a.company.id);
  const loc2 = await ta.db.location.create({ data: { companyId: a.company.id, name: "Вторая точка" } });
  return { a, b, ta, tb: tenant(b.company.id), loc2 };
}

const qty = async (t: ReturnType<typeof tenant>, productId: string, locationId: string) =>
  (await t.db.stock.findFirst({ where: { productId, locationId } }))?.qty ?? 0;

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: process.env, stdio: "ignore" });
});

describe("склад: документы", () => {
  it("оприходование, перемещение, списание и инвентаризация меняют остатки", async () => {
    const { a, ta, loc2 } = await setup();
    const p = await ta.db.product.create({ data: { companyId: a.company.id, name: "Дисплей", price: 300000 } });
    const u = a.owner.id;
    await createStockDoc(ta, { type: "RECEIPT", locationId: a.location.id, userId: u, items: [{ productId: p.id, qty: 10, cost: 100000 }] });
    expect(await qty(ta, p.id, a.location.id)).toBe(10);
    expect((await ta.db.product.findUniqueOrThrow({ where: { id: p.id } })).cost).toBe(100000);

    await createStockDoc(ta, { type: "TRANSFER", locationId: a.location.id, toLocationId: loc2.id, userId: u, items: [{ productId: p.id, qty: 3 }] });
    expect(await qty(ta, p.id, a.location.id)).toBe(7);
    expect(await qty(ta, p.id, loc2.id)).toBe(3);

    await createStockDoc(ta, { type: "WRITEOFF", locationId: a.location.id, userId: u, comment: "брак", items: [{ productId: p.id, qty: 2 }] });
    expect(await qty(ta, p.id, a.location.id)).toBe(5);

    await createStockDoc(ta, { type: "INVENTORY", locationId: a.location.id, userId: u, items: [{ productId: p.id, qty: 4 }] });
    expect(await qty(ta, p.id, a.location.id)).toBe(4);

    await expect(
      createStockDoc(ta, { type: "WRITEOFF", locationId: a.location.id, userId: u, items: [{ productId: p.id, qty: 99 }] }),
    ).rejects.toThrow(/Недостаточно/);
    expect(await qty(ta, p.id, a.location.id)).toBe(4);
  });

  it("нельзя переместить товар на точку другой компании", async () => {
    const { a, b, ta } = await setup();
    const p = await ta.db.product.create({ data: { companyId: a.company.id, name: "АКБ", price: 100000 } });
    await createStockDoc(ta, { type: "RECEIPT", locationId: a.location.id, userId: a.owner.id, items: [{ productId: p.id, qty: 2, cost: 1 }] });
    await expect(
      createStockDoc(ta, { type: "TRANSFER", locationId: a.location.id, toLocationId: b.location.id, userId: a.owner.id, items: [{ productId: p.id, qty: 1 }] }),
    ).rejects.toThrow();
    expect(await qty(ta, p.id, a.location.id)).toBe(2);
  });
});

describe("продажи", () => {
  it("скидка на чек, минимальная цена, возврат и смена", async () => {
    const { a, ta } = await setup();
    const u = a.owner.id;
    const p = await ta.db.product.create({ data: { companyId: a.company.id, name: "Стекло", price: 50000, minPrice: 30000 } });
    await createStockDoc(ta, { type: "RECEIPT", locationId: a.location.id, userId: u, items: [{ productId: p.id, qty: 5, cost: 5000 }] });
    await openShift(ta, { locationId: a.location.id, userId: u });

    await expect(createSale(ta, { locationId: a.location.id, userId: u, method: "CASH", items: [{ productId: p.id, qty: 1, price: 20000 }] })).rejects.toThrow(/минимальной/);

    const sale = await createSale(ta, {
      locationId: a.location.id,
      userId: u,
      method: "CASH",
      discount: 10000,
      client: { phone: "8 917 000 00 01", name: "Покупатель" },
      items: [{ productId: p.id, qty: 2 }],
    });
    expect(sale.total).toBe(90000);
    expect(sale.clientId).toBeTruthy();
    expect(await qty(ta, p.id, a.location.id)).toBe(3);
    expect(await cashOnHand(ta, a.location.id)).toBe(90000);

    const items = await ta.db.saleItem.findMany({ where: { saleId: sale.id } });
    const ret = await returnSale(ta, { saleId: sale.id, userId: u, method: "CASH", items: [{ saleItemId: items[0].id, qty: 1 }] });
    expect(ret.total).toBe(-45000); // половина чека с учётом скидки
    expect(await qty(ta, p.id, a.location.id)).toBe(4);
    await expect(returnSale(ta, { saleId: sale.id, userId: u, method: "CASH", items: [{ saleItemId: items[0].id, qty: 2 }] })).rejects.toThrow(/не больше 1/);

    const closed = await closeShift(ta, { locationId: a.location.id, userId: u, closeCash: 40000 });
    expect(closed.expectedCash).toBe(45000);
    expect(await cashOnHand(ta, a.location.id)).toBe(40000); // недостача записана в кассу
  });
});

describe("заказы: скидка и выдача", () => {
  it("выдача с доплатой учитывает скидку", async () => {
    const { a, ta } = await setup();
    const o = await createOrder(ta, { locationId: a.location.id, authorId: a.owner.id, client: { phone: "89000000001" }, deviceType: "Телефон", problem: "АКБ" });
    await addService(ta, o.id, a.owner.id, { name: "Замена АКБ", price: 200000 });
    await setDiscount(ta, o.id, a.owner.id, { pct: 10, sum: 0 });
    await issueOrder(ta, { orderId: o.id, userId: a.owner.id, method: "CARD", takePayment: true });
    const t = await orderTotals(ta, o.id);
    expect(t.total).toBe(180000);
    expect(t.due).toBe(0);
    const order = await ta.db.order.findUniqueOrThrow({ where: { id: o.id }, include: { status: true } });
    expect(order.status.kind).toBe("CLOSED");
  });
});

describe("загрузка из Excel", () => {
  it("товары: создаёт группы и поставщиков, ставит остатки, повторная загрузка без дублей", async () => {
    const { a, ta, tb } = await setup();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Товары");
    ws.addRow(["Код", "Наименование", "Группа", "Поставщик", "Кол-во", "Мин. остаток", "Закупочная", "Розничная", "Ремонтная", "Минимальная"]);
    ws.addRow([18, "Печать ксерокопия", "Печать", "", 3343, "", "", 10, "", ""]);
    ws.addRow([63, "Стекло защитное iPhone 6+/7+/8+", "Аксессуары", "KitOpt02", 70, 5, "45,5", 350, 300, 200]);
    ws.addRow(["", "", "", "", "", "", "", "", "", ""]);
    const buf = await wb.xlsx.writeBuffer();
    const file = new File([buf], "export.xlsx");
    const table = await readTable(file);

    const dry = await importProducts(ta, table, { locationId: a.location.id, userId: a.owner.id, dryRun: true });
    expect(dry.created).toBe(2);
    expect(await ta.db.product.count()).toBe(0);

    const rep = await importProducts(ta, table, { locationId: a.location.id, userId: a.owner.id, dryRun: false });
    expect(rep).toMatchObject({ created: 2, updated: 0, stockRows: 2, errors: [] });
    const glass = await ta.db.product.findFirstOrThrow({ where: { sku: "63" }, include: { group: true, supplier: true } });
    expect(glass).toMatchObject({ price: 35000, repairPrice: 30000, minPrice: 20000, cost: 4550, minQty: 5 });
    expect(glass.group?.name).toBe("Аксессуары");
    expect(glass.supplier?.name).toBe("KitOpt02");
    expect(await qty(ta, glass.id, a.location.id)).toBe(70);

    const again = await importProducts(ta, table, { locationId: a.location.id, userId: a.owner.id, dryRun: false });
    expect(again).toMatchObject({ created: 0, updated: 2 });
    expect(await ta.db.product.count()).toBe(2);
    expect(await qty(ta, glass.id, a.location.id)).toBe(70);
    expect(await tb.db.product.count()).toBe(0);
  });

  it("клиенты из CSV: по телефону, без дублей", async () => {
    const { ta } = await setup();
    const csv = "﻿ФИО;Телефон;Источник\nИван Петров;+7 (900) 123-45-67;Авито\nБез телефона;;\n";
    const table = await readTable(new File([csv], "clients.csv", { type: "text/csv" }));
    const rep = await importClients(ta, table, { dryRun: false });
    expect(rep).toMatchObject({ created: 1, skipped: 1 });
    const c = await ta.db.client.findFirstOrThrow({ include: { adSource: true } });
    expect(c).toMatchObject({ name: "Иван Петров", phone: "+79001234567" });
    expect(c.adSource?.name).toBe("Авито");
    expect((await importClients(ta, table, { dryRun: false })).updated).toBe(1);
    expect(await ta.db.client.count()).toBe(1);
  });
});
