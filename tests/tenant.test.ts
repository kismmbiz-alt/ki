import { beforeAll, describe, expect, it } from "vitest";
import { execSync } from "child_process";
import { prisma, tenant } from "@/lib/db";
import { createCompany } from "@/lib/domain/company";
import { addPart, addPayment, addService, changeStatus, createOrder, orderTotals } from "@/lib/domain/orders";
import { receiveStock } from "@/lib/domain/stock";
import { createSale } from "@/lib/domain/sales";
import { cashBalance } from "@/lib/domain/cash";
import { periodReport } from "@/lib/domain/reports";

const uniq = () => Math.random().toString(36).slice(2, 8);

async function setup() {
  const a = await createCompany({ companyName: "Мастерская А", ownerName: "Кирилл", email: `a-${uniq()}@test.ru`, password: "password123" });
  const b = await createCompany({ companyName: "Мастерская Б", ownerName: "Коллега", email: `b-${uniq()}@test.ru`, password: "password123" });
  return { a, b, ta: tenant(a.company.id), tb: tenant(b.company.id) };
}

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: process.env, stdio: "ignore" });
});

describe("изоляция компаний", () => {
  it("компания не видит клиентов, заказы, точки и сотрудников другой компании", async () => {
    const { a, ta, tb } = await setup();
    const order = await createOrder(ta, {
      locationId: a.location.id,
      authorId: a.owner.id,
      client: { name: "Иван", phone: "8 900 111-22-33" },
      deviceType: "Телефон",
      problem: "Разбит экран",
    });

    expect(await tb.db.order.findMany()).toHaveLength(0);
    expect(await tb.db.client.findMany()).toHaveLength(0);
    expect(await tb.db.order.findUnique({ where: { id: order.id } })).toBeNull();
    expect(await tb.db.client.findUnique({ where: { id: order.clientId } })).toBeNull();
    expect(await tb.db.location.findUnique({ where: { id: a.location.id } })).toBeNull();
    expect(await tb.db.user.findUnique({ where: { id: a.owner.id } })).toBeNull();
    expect(await tb.db.location.findMany()).toHaveLength(1);
    expect(await tb.db.orderStatus.count()).toBe(8);

    // изменить или удалить чужой заказ нельзя
    await expect(tb.db.order.update({ where: { id: order.id }, data: { problem: "взлом" } })).rejects.toThrow();
    expect((await tb.db.order.updateMany({ where: { id: order.id }, data: { problem: "взлом" } })).count).toBe(0);
    expect((await tb.db.order.deleteMany({})).count).toBe(0);
    expect((await ta.db.order.findUniqueOrThrow({ where: { id: order.id } })).problem).toBe("Разбит экран");

    // попытка подменить companyId в запросе не помогает
    expect(await tb.db.order.findMany({ where: { companyId: a.company.id } })).toHaveLength(0);
  });

  it("нельзя создать заказ на чужого клиента, чужую точку или чужого мастера", async () => {
    const { a, b, ta, tb } = await setup();
    const order = await createOrder(ta, {
      locationId: a.location.id,
      authorId: a.owner.id,
      client: { name: "Иван", phone: "+79001112233" },
      deviceType: "Ноутбук",
      problem: "Не включается",
    });
    await expect(
      createOrder(tb, { locationId: b.location.id, authorId: b.owner.id, client: { id: order.clientId }, deviceType: "x", problem: "x" }),
    ).rejects.toThrow();
    await expect(
      createOrder(tb, { locationId: a.location.id, authorId: b.owner.id, client: { name: "Пётр", phone: "+79005556677" }, deviceType: "x", problem: "x" }),
    ).rejects.toThrow();
    await expect(
      createOrder(tb, {
        locationId: b.location.id,
        authorId: b.owner.id,
        masterId: a.owner.id,
        client: { name: "Пётр", phone: "+79005556677" },
        deviceType: "x",
        problem: "x",
      }),
    ).rejects.toThrow();
  });

  it("номера заказов у каждой компании свои", async () => {
    const { a, b, ta, tb } = await setup();
    const base = { client: { name: "К", phone: "+79000000001" }, deviceType: "Телефон", problem: "x" };
    const a1 = await createOrder(ta, { ...base, locationId: a.location.id, authorId: a.owner.id });
    const a2 = await createOrder(ta, { ...base, locationId: a.location.id, authorId: a.owner.id });
    const b1 = await createOrder(tb, { ...base, locationId: b.location.id, authorId: b.owner.id });
    expect([a1.number, a2.number, b1.number]).toEqual([1, 2, 1]);
  });
});

describe("работа мастерской", () => {
  it("заказ: работа, запчасть со склада, оплата, выдача, отчёт и зарплата", async () => {
    const { a, ta } = await setup();
    const master = await ta.db.user.create({
      data: { companyId: a.company.id, email: `m-${uniq()}@test.ru`, name: "Мастер Олег", passwordHash: "x", role: "MASTER", salaryPercent: 40 },
    });
    const screen = await ta.db.product.create({ data: { companyId: a.company.id, name: "Дисплей iPhone 11", price: 500000 } });
    await receiveStock(ta, { productId: screen.id, locationId: a.location.id, qty: 3, cost: 300000, userId: a.owner.id });

    const order = await createOrder(ta, {
      locationId: a.location.id,
      authorId: a.owner.id,
      masterId: master.id,
      client: { name: "Иван", phone: "89001112233" },
      deviceType: "Телефон",
      brand: "Apple",
      model: "iPhone 11",
      problem: "Разбит экран",
      prepayment: 100000,
    });
    await addService(ta, order.id, a.owner.id, { name: "Замена дисплея", price: 200000 });
    await addPart(ta, order.id, a.owner.id, { productId: screen.id, qty: 1 });

    const stock = await ta.db.stock.findFirstOrThrow({ where: { productId: screen.id } });
    expect(stock.qty).toBe(2);

    let t = await orderTotals(ta, order.id);
    expect(t).toMatchObject({ total: 700000, paid: 100000, due: 600000, profit: 400000 });

    const closed = await ta.db.orderStatus.findFirstOrThrow({ where: { kind: "CLOSED" } });
    await expect(changeStatus(ta, order.id, closed.id, a.owner.id)).rejects.toThrow(/должен/);

    await addPayment(ta, { orderId: order.id, userId: a.owner.id, amount: 600000, method: "CARD" });
    t = await orderTotals(ta, order.id);
    expect(t.due).toBe(0);
    await changeStatus(ta, order.id, closed.id, a.owner.id);

    // закрытый заказ менять нельзя
    await expect(addService(ta, order.id, a.owner.id, { name: "x", price: 1 })).rejects.toThrow(/закрыт/);

    expect(await cashBalance(ta, a.location.id)).toEqual({ CASH: 100000, CARD: 600000, TRANSFER: 0 });

    const r = await periodReport(ta, new Date(Date.now() - 864e5), new Date(Date.now() + 864e5));
    expect(r.closedCount).toBe(1);
    expect(r.ordersRevenue).toBe(700000);
    expect(r.masters).toEqual([{ name: "Мастер Олег", percent: 40, orders: 1, services: 200000, salary: 80000 }]);
  });

  it("склад не уходит в минус, продажа списывает товар и пополняет кассу", async () => {
    const { a, ta } = await setup();
    const glass = await ta.db.product.create({ data: { companyId: a.company.id, name: "Защитное стекло", price: 50000 } });
    await receiveStock(ta, { productId: glass.id, locationId: a.location.id, qty: 2, cost: 10000, userId: a.owner.id });
    await expect(
      createSale(ta, { locationId: a.location.id, userId: a.owner.id, method: "CASH", items: [{ productId: glass.id, qty: 3 }] }),
    ).rejects.toThrow(/Недостаточно/);
    const sale = await createSale(ta, { locationId: a.location.id, userId: a.owner.id, method: "CASH", items: [{ productId: glass.id, qty: 2 }] });
    expect(sale.total).toBe(100000);
    expect((await ta.db.stock.findFirstOrThrow({ where: { productId: glass.id } })).qty).toBe(0);
    expect((await cashBalance(ta, a.location.id)).CASH).toBe(100000);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
import { afterAll } from "vitest";
