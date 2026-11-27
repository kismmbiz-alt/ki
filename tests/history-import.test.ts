import { beforeAll, describe, expect, it } from "vitest";
import { execSync } from "child_process";
import { tenant } from "@/lib/db";
import { createCompany } from "@/lib/domain/company";
import { orderTotals } from "@/lib/domain/orders";
import { importHistory, type HistoryData } from "@/lib/domain/history-import";

const uniq = () => Math.random().toString(36).slice(2, 8);

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: process.env, stdio: "ignore" });
});

const data: HistoryData = {
  orders: [
    {
      number: 188,
      createdAt: "2026-10-02T16:51:00+05:00",
      status: "CLOSED",
      client: { name: "Артём", phone: "+7 (937) 151-11-35" },
      source: "С улицы",
      deviceType: "Телефон",
      brand: "Samsung",
      model: "a21s",
      problem: "Замена дисплейного модуля",
      master: "Кирилл Иванов",
      manager: "Голин Рихард",
      closedAt: "2026-10-07T16:27:00+05:00",
      items: [
        { kind: "SERVICE", name: "Замена дисплея", qty: 1, price: 2152, warrantyDays: 30 },
        { kind: "PART", name: "Дисплей A21s", qty: 1, price: 1348, warrantyDays: 30 },
      ],
      payments: [{ at: "2026-10-07T16:27:00+05:00", amount: 3500, method: "Наличными" }],
      events: [{ at: "2026-10-07T16:27:00+05:00", text: "Статус: Выдан" }],
    },
  ],
  sales: [
    {
      number: 2061,
      createdAt: "2026-10-31T18:50:00+05:00",
      user: "Голин Рихард",
      profit: 330,
      items: [{ name: "Чистка динамиков", qty: 1, price: 350 }],
      payments: [{ amount: 350, method: "картой" }],
    },
    {
      number: 2008,
      createdAt: "2026-10-25T16:12:00+05:00",
      discount: 98,
      items: [
        { name: "Б/У Xiaomi POCO C51", qty: 1, price: 3990 },
        { name: "Комплект BA20A", qty: 1, price: 490 },
      ],
      payments: [{ amount: 4382, method: "Наличными" }],
      returned: { items: [{ name: "Б/У Xiaomi POCO C51", qty: 1, price: 3990 }, { name: "Комплект BA20A", qty: 1, price: 392 }], amount: 4382, method: "Наличными" },
    },
  ],
  cash: [
    { at: "2026-10-31T23:59:00+05:00", amount: -5000, method: "Наличными", category: "Выплата заработной платы", comment: "Мастер" },
    { at: "2026-10-21T18:19:00+05:00", amount: 60000, method: "Безналом", category: "Перемещение денег в кассу" },
  ],
};

describe("перенос истории из LiveSklad", () => {
  it("заказы и продажи с датами, без дублей, номера продолжаются", async () => {
    const a = await createCompany({ companyName: "А", ownerName: "Кирилл Иванов", email: `h-${uniq()}@test.ru`, password: "password123" });
    const t = tenant(a.company.id);
    const o = { locationId: a.location.id, userId: a.owner.id };

    const dry = await importHistory(t, data, { ...o, dryRun: true });
    expect(dry).toMatchObject({ orders: 1, sales: 2, returns: 1, clients: 1, products: 3, orderPaid: 350000, salesPaid: 35000 });
    expect(await t.db.order.count()).toBe(0);

    const rep = await importHistory(t, data, { ...o, dryRun: false });
    expect(rep).toMatchObject({ orders: 1, sales: 2, returns: 1, cash: 2, cashSum: 5500000, errors: [] });
    const order = await t.db.order.findFirstOrThrow({ include: { status: true, payments: true } });
    expect(order.number).toBe(188);
    expect(order.status.kind).toBe("CLOSED");
    expect(order.createdAt.toISOString()).toBe("2026-10-02T11:51:00.000Z");
    expect(order.masterId).toBe(a.owner.id);
    expect(order.notes).toContain("Менеджер в LiveSklad: Голин Рихард");
    expect(order.payments[0]).toMatchObject({ amount: 350000, method: "CASH" });
    expect(order.payments[0].createdAt.toISOString()).toBe("2026-10-07T11:27:00.000Z");
    const tot = await orderTotals(t, order.id);
    expect(tot).toMatchObject({ total: 350000, due: 0, profit: 215200 });

    const sale = await t.db.sale.findFirstOrThrow({ where: { number: 2061 }, include: { items: true, transactions: true } });
    const ret = await t.db.sale.findFirstOrThrow({ where: { isReturn: true }, include: { transactions: true } });
    expect(ret).toMatchObject({ number: 1002008, total: -438200 });
    expect(ret.transactions[0]).toMatchObject({ amount: -438200, method: "CASH" });
    expect(sale).toMatchObject({ number: 2061, total: 35000 });
    expect(sale.items[0].cost).toBe(2000);
    expect(sale.transactions[0].method).toBe("CARD");
    expect(await t.db.stock.count()).toBe(0);

    const again = await importHistory(t, data, { ...o, dryRun: false });
    expect(again).toMatchObject({ orders: 0, sales: 0, skippedOrders: [188], skippedSales: [2061, 2008], cash: 0, skippedCash: 2 });
    const c = await t.db.order.count();
    expect(c).toBe(1);
    const company = await t.db.company.findUniqueOrThrow({ where: { id: a.company.id } });
    expect(company).toMatchObject({ orderSeq: 188, saleSeq: 2061 });
  });

  it("кассы LiveSklad: новые операции в своих кассах, старые разносятся, переводы связываются, удалённые помечаются", async () => {
    const a = await createCompany({ companyName: "Б", ownerName: "Кирилл Иванов", email: `k-${uniq()}@test.ru`, password: "password123" });
    const t = tenant(a.company.id);
    const o = { locationId: a.location.id, userId: a.owner.id, dryRun: false };
    // сначала перенос без касс, как в октябре
    await importHistory(t, data, o);
    const withBoxes: HistoryData = {
      orders: data.orders!.map((x) => ({ ...x, payments: x.payments.map((p) => ({ ...p, cashbox: "Ремонт" })) })),
      sales: data.sales!.map((x) => ({ ...x, cashbox: "Б/У Техника" })),
      cash: [
        { ...data.cash![0], cashbox: "Касса" },
        { ...data.cash![1], cashbox: "Инвест", transferKey: "t1" },
        { at: "2026-10-21T18:19:00+05:00", amount: -60000, method: "Наличными", category: "Перемещение денег из кассы", cashbox: "Касса", transferKey: "t1" },
        { at: "2026-09-30T23:59:00+05:00", amount: 1721.15, method: "Наличными", category: "Начальный остаток", cashbox: "Касса" },
        { at: "2026-11-20T15:00:00+05:00", amount: -104.77, method: "Наличными", category: "Оплата за товар поставщику", cashbox: "Касса", supplier: "Мой склад УФА" },
      ],
      deleted: [{ at: "2026-10-31T23:59:00+05:00", amount: -5000 }],
    };
    const dry = await importHistory(t, withBoxes, { ...o, dryRun: true });
    expect(dry).toMatchObject({ cash: 3, skippedCash: 2, deleted: 1, relinked: 0 });
    expect(dry.cashboxes.sort()).toEqual(["Инвест", "Касса", "Ремонт", "Б/У Техника"].sort());
    expect(await t.db.cashbox.count()).toBe(1);

    const rep = await importHistory(t, withBoxes, o);
    expect(rep).toMatchObject({ orders: 0, sales: 0, cash: 3, skippedCash: 2, deleted: 1, errors: [] });
    expect(rep.relinked).toBe(6); // оплата заказа, две продажи, возврат, расход, перемещение
    const boxes = new Map((await t.db.cashbox.findMany()).map((b) => [b.name, b.id]));
    const order = await t.db.order.findFirstOrThrow({ include: { payments: true } });
    expect(order.payments[0].cashboxId).toBe(boxes.get("Ремонт"));
    const ret = await t.db.sale.findFirstOrThrow({ where: { isReturn: true }, include: { transactions: true } });
    expect(ret.transactions[0].cashboxId).toBe(boxes.get("Б/У Техника"));
    const tr = await t.db.cashTransaction.findMany({ where: { transferId: { not: null } } });
    expect(tr).toHaveLength(2);
    expect(new Set(tr.map((x) => x.transferId)).size).toBe(1);
    const sup = await t.db.cashTransaction.findFirstOrThrow({ where: { category: "Оплата за товар поставщику" }, include: { } });
    expect(sup.supplierId).toBeTruthy();
    const del = await t.db.cashTransaction.findFirstOrThrow({ where: { category: "Выплата заработной платы" } });
    expect(del).toMatchObject({ amount: 0, origAmount: -500000 });
    expect(del.deletedAt).toBeTruthy();

    // повтор ничего не меняет
    const again = await importHistory(t, withBoxes, o);
    expect(again).toMatchObject({ cash: 0, skippedCash: 5, relinked: 0, deleted: 0, cashboxes: [] });
  });
});
