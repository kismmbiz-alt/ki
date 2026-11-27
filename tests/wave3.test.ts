import { beforeAll, describe, expect, it } from "vitest";
import { execSync } from "child_process";
import { tenant } from "@/lib/db";
import { can } from "@/lib/perms";
import { createCompany } from "@/lib/domain/company";
import { createStockDoc } from "@/lib/domain/stock";
import { addCashTransaction, cashboxBalances, transferCash } from "@/lib/domain/cash";
import { cashOnHand, closeShift, createSale, openShift, returnSale } from "@/lib/domain/sales";
import { createOrder, addPart, removeItem, addPayment } from "@/lib/domain/orders";
import { defaultCashboxId, defaultWarehouseId, resolveCashbox } from "@/lib/domain/places";
import { periodRange, planFor } from "@/lib/domain/dashboard";
import { DEFAULT_POSITIONS } from "@/lib/perms";

const uniq = () => Math.random().toString(36).slice(2, 8);

async function setup() {
  const a = await createCompany({ companyName: "А", ownerName: "Кирилл", email: `w3-${uniq()}@test.ru`, password: "password123" });
  const t = tenant(a.company.id);
  const mainWh = await defaultWarehouseId(t.db, a.location.id);
  const mainBox = await defaultCashboxId(t.db, a.location.id);
  const card = await t.db.cashbox.create({ data: { companyId: a.company.id, locationId: a.location.id, name: "Карта Сбер" } });
  const bank = await t.db.cashbox.create({ data: { companyId: a.company.id, locationId: null, name: "Расчётный счёт" } });
  const iphones = await t.db.warehouse.create({ data: { companyId: a.company.id, locationId: a.location.id, name: "Айфоны", cashboxId: card.id } });
  return { a, t, mainWh, mainBox, card, bank, iphones, u: a.owner.id };
}

const qty = async (t: ReturnType<typeof tenant>, productId: string, warehouseId: string) =>
  (await t.db.stock.findFirst({ where: { productId, warehouseId } }))?.qty ?? 0;

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: process.env, stdio: "ignore" });
});

describe("должности и права", () => {
  it("новая компания получает стандартные должности", async () => {
    const { t } = await setup();
    const names = (await t.db.position.findMany({ orderBy: { sort: "asc" } })).map((p) => p.name);
    expect(names).toEqual(DEFAULT_POSITIONS.map((p) => p.name));
  });

  it("права берутся из должности, владелец может всё", () => {
    expect(can({ role: "OWNER", perms: [] }, "users")).toBe(true);
    expect(can({ role: "MANAGER", perms: ["sales"] }, "sales")).toBe(true);
    expect(can({ role: "MANAGER", perms: ["sales"] }, "cash")).toBe(false);
    // без должности — права по типу доступа
    expect(can({ role: "MASTER" }, "allOrders")).toBe(false);
    expect(can({ role: "MANAGER" }, "orderPay")).toBe(true);
  });
});

describe("несколько складов", () => {
  it("остатки ведутся по складам, перемещение между складами точки", async () => {
    const { a, t, mainWh, iphones, u } = await setup();
    const p = await t.db.product.create({ data: { companyId: a.company.id, name: "iPhone 13", price: 4000000 } });
    await createStockDoc(t, { type: "RECEIPT", warehouseId: mainWh, userId: u, items: [{ productId: p.id, qty: 3, cost: 3000000 }] });
    expect(await qty(t, p.id, mainWh)).toBe(3);
    await createStockDoc(t, { type: "TRANSFER", warehouseId: mainWh, toWarehouseId: iphones.id, userId: u, items: [{ productId: p.id, qty: 2 }] });
    expect(await qty(t, p.id, mainWh)).toBe(1);
    expect(await qty(t, p.id, iphones.id)).toBe(2);
    // на складе «Айфоны» только 2 — больше списать нельзя
    await expect(createStockDoc(t, { type: "WRITEOFF", warehouseId: iphones.id, userId: u, items: [{ productId: p.id, qty: 3 }] })).rejects.toThrow(/Айфоны/);
    await createStockDoc(t, { type: "SUPPLIER_RETURN", warehouseId: iphones.id, userId: u, items: [{ productId: p.id, qty: 1 }] });
    expect(await qty(t, p.id, iphones.id)).toBe(1);
    const inv = await createStockDoc(t, { type: "INVENTORY", warehouseId: mainWh, userId: u, items: [{ productId: p.id, qty: 5 }] });
    expect(inv.total).toBe(4 * 3000000);
    expect(await qty(t, p.id, mainWh)).toBe(5);
    expect(await t.db.actionLog.count({ where: { kind: "stock" } })).toBe(4);
  });

  it("запчасть в заказ списывается с выбранного склада и возвращается туда же", async () => {
    const { a, t, iphones, u } = await setup();
    const p = await t.db.product.create({ data: { companyId: a.company.id, name: "Дисплей 13", price: 900000 } });
    await createStockDoc(t, { type: "RECEIPT", warehouseId: iphones.id, userId: u, items: [{ productId: p.id, qty: 2, cost: 400000 }] });
    const o = await createOrder(t, { locationId: a.location.id, authorId: u, client: { name: "Иван", phone: "89001234567" }, deviceType: "Телефон", problem: "Разбит" });
    await addPart(t, o.id, u, { productId: p.id, qty: 1, warehouseId: iphones.id });
    expect(await qty(t, p.id, iphones.id)).toBe(1);
    const item = await t.db.orderItem.findFirstOrThrow({ where: { orderId: o.id } });
    expect(item.warehouseId).toBe(iphones.id);
    await removeItem(t, item.id, u);
    expect(await qty(t, p.id, iphones.id)).toBe(2);
  });
});

describe("кассы", () => {
  it("продажа со склада идёт в привязанную кассу, возврат — из неё же", async () => {
    const { a, t, iphones, card, u } = await setup();
    const p = await t.db.product.create({ data: { companyId: a.company.id, name: "iPhone 12", price: 3000000 } });
    await createStockDoc(t, { type: "RECEIPT", warehouseId: iphones.id, userId: u, items: [{ productId: p.id, qty: 1, cost: 2000000 }] });
    const sale = await createSale(t, { locationId: a.location.id, warehouseId: iphones.id, userId: u, method: "CARD", items: [{ productId: p.id, qty: 1 }] });
    expect(sale.warehouseId).toBe(iphones.id);
    expect((await cashboxBalances(t, [card.id])).get(card.id)!.total).toBe(3000000);
    const item = await t.db.saleItem.findFirstOrThrow({ where: { saleId: sale.id } });
    await returnSale(t, { saleId: sale.id, userId: u, method: "CARD", items: [{ saleItemId: item.id, qty: 1 }] });
    expect((await cashboxBalances(t, [card.id])).get(card.id)!.total).toBe(0);
    expect(await qty(t, p.id, iphones.id)).toBe(1);
  });

  it("перевод между кассами не меняет общий остаток", async () => {
    const { a, t, mainBox, bank, u } = await setup();
    await addCashTransaction(t, { locationId: a.location.id, cashboxId: mainBox, userId: u, amount: 1000000, method: "CASH", category: "Внесение в кассу" });
    await transferCash(t, { fromCashboxId: mainBox, toCashboxId: bank.id, amount: 600000, userId: u, locationId: a.location.id, comment: "инкассация" });
    const b = await cashboxBalances(t, [mainBox, bank.id]);
    expect(b.get(mainBox)!.total).toBe(400000);
    expect(b.get(bank.id)!.total).toBe(600000);
    const rows = await t.db.cashTransaction.findMany({ where: { transferId: { not: null } } });
    expect(rows).toHaveLength(2);
    expect(rows[0].transferId).toBe(rows[1].transferId);
    await expect(transferCash(t, { fromCashboxId: mainBox, toCashboxId: mainBox, amount: 1, userId: u, locationId: a.location.id })).rejects.toThrow(/разные/);
    expect(await t.db.actionLog.count({ where: { kind: "cash" } })).toBe(2);
  });

  it("оплата заказа в выбранную кассу; касса чужой точки не подходит", async () => {
    const { a, t, card, u } = await setup();
    const loc2 = await t.db.location.create({ data: { companyId: a.company.id, name: "Вторая" } });
    const box2 = (await t.db.cashbox.create({ data: { companyId: a.company.id, locationId: loc2.id, name: "Касса второй точки" } })).id;
    const o = await createOrder(t, { locationId: a.location.id, authorId: u, client: { name: "Пётр", phone: "89007654321" }, deviceType: "Ноутбук", problem: "Не включается" });
    await addPayment(t, { orderId: o.id, userId: u, amount: 150000, method: "CARD", cashboxId: card.id });
    expect((await cashboxBalances(t, [card.id])).get(card.id)!.total).toBe(150000);
    await expect(resolveCashbox(t.db, a.location.id, box2)).rejects.toThrow(/другой точке/);
  });

  it("смена открывается на конкретную кассу", async () => {
    const { a, t, mainBox, card, u } = await setup();
    await addCashTransaction(t, { locationId: a.location.id, cashboxId: card.id, userId: u, amount: 50000, method: "CASH", category: "Внесение в кассу" });
    await openShift(t, { locationId: a.location.id, cashboxId: card.id, userId: u });
    expect(await cashOnHand(t, { locationId: a.location.id, cashboxId: card.id })).toBe(50000);
    expect(await cashOnHand(t, { locationId: a.location.id, cashboxId: mainBox })).toBe(0);
    // смена на основной кассе не открыта
    await expect(closeShift(t, { locationId: a.location.id, cashboxId: mainBox, userId: u, closeCash: 0 })).rejects.toThrow(/не открыта/);
    const closed = await closeShift(t, { locationId: a.location.id, cashboxId: card.id, userId: u, closeCash: 40000 });
    expect(closed.expectedCash).toBe(50000);
    expect(await cashOnHand(t, { locationId: a.location.id, cashboxId: card.id })).toBe(40000);
  });
});

describe("главная: периоды и план", () => {
  it("границы периодов", () => {
    const d = new Date(2026, 10, 27); // чт 27 ноября 2026
    expect(periodRange("day", d).from).toEqual(new Date(2026, 10, 27));
    expect(periodRange("week", d).from).toEqual(new Date(2026, 10, 23));
    expect(periodRange("month", d).to).toEqual(new Date(2026, 11, 1));
    const q = periodRange("quarter", d);
    expect(q.from).toEqual(new Date(2026, 9, 1));
    expect(q.prevFrom).toEqual(new Date(2026, 6, 1));
    const c = periodRange("custom", d, { from: new Date(2026, 10, 1), to: new Date(2026, 10, 10) });
    expect(c.to).toEqual(new Date(2026, 10, 11));
    expect(c.prevFrom).toEqual(new Date(2026, 9, 22));
  });

  it("план пропорционален дням периода", () => {
    expect(planFor(3000000, new Date(2026, 10, 1), new Date(2026, 11, 1))).toBe(3000000);
    expect(planFor(3000000, new Date(2026, 10, 1), new Date(2026, 10, 11))).toBe(1000000);
    expect(planFor(0, new Date(2026, 10, 1), new Date(2026, 11, 1))).toBe(0);
  });
});
