import { beforeAll, describe, expect, it } from "vitest";
import { execSync } from "child_process";
import { tenant } from "@/lib/db";
import { createCompany } from "@/lib/domain/company";
import { createOrder, addService, statusRuleError } from "@/lib/domain/orders";
import { accrue, pickRule, ruleBase, salarySheet } from "@/lib/domain/salary";
import { ensurePriceTypes, priceOf, saveProductPrices } from "@/lib/domain/prices";
import { nextBarcode } from "@/lib/domain/barcodes";
import { barcodeSvg, ean13Check, internalEan13, isEan13 } from "@/lib/barcode";
import { expandTables, fillVars, fmtNum, renderTemplate } from "@/lib/print/engine";
import { numberWords, rubWords } from "@/lib/print/words";
import { ensureTemplates, pageCss, SEED_TEMPLATES } from "@/lib/print/templates";
import { orderCtx, priceTagCtxs } from "@/lib/print/data";

const uniq = () => Math.random().toString(36).slice(2, 8);

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: process.env, stdio: "ignore" });
});

describe("сумма прописью и числа", () => {
  it("рубли и копейки", () => {
    expect(rubWords(123450)).toBe("Одна тысяча двести тридцать четыре рубля 50 копеек");
    expect(rubWords(100)).toBe("Один рубль 00 копеек");
    expect(numberWords(2_000_011)).toBe("два миллиона одиннадцать");
  });
  it("разделители тысяч как в LiveSklad", () => {
    expect(fmtNum(1234567.8, 2)).toBe("1 234 567.80");
    expect(fmtNum(-500, 0)).toBe("-500");
  });
});

describe("штрихкоды", () => {
  it("EAN-13: контрольная цифра и внутренние коды", () => {
    expect(ean13Check("460123456789")).toBe(Number("4601234567893".slice(-1)));
    const c = internalEan13(42);
    expect(c).toHaveLength(13);
    expect(c.startsWith("2")).toBe(true);
    expect(isEan13(c)).toBe(true);
  });
  it("SVG для EAN-13 и для произвольного текста", () => {
    expect(barcodeSvg(internalEan13(1))).toContain("<svg");
    expect(barcodeSvg("A123")).toContain("<rect");
    expect(barcodeSvg("")).toBe("");
  });
});

describe("движок печатных форм", () => {
  it("подставляет переменные с форматами", () => {
    const html = "<p>&lt;Итого(#)&gt; / &lt;Итого&gt; / &lt;Наименование(5)&gt; / &lt;Неизвестная&gt; / &lt;Цвет&gt;</p>";
    const out = fillVars(html, { Итого: { money: 123456 }, Наименование: "Дисплей iPhone" });
    expect(out).toBe("<p>1 235 / 1 234.56 / Диспл… / &lt;Неизвестная&gt; / </p>");
  });
  it("экранирует данные клиента", () => {
    expect(fillVars("&lt;Контрагент&gt;", { Контрагент: '<script>"x"' })).toBe("&lt;script&gt;&quot;x&quot;");
  });
  it("размножает строку позиций в таблице wp-table", () => {
    const html = '<table class="wp-table"><tr><td>№</td><td>Товар</td></tr><tr><td>&lt;№&gt;</td><td>&lt;Наименование&gt;</td></tr></table><p>&lt;Итого&gt;</p>';
    const out = expandTables(html, [{ Наименование: "A" }, { Наименование: "B" }], {});
    expect(out.match(/<tr>/g)).toHaveLength(3);
    expect(out).toContain("<td>2</td><td>B</td>");
  });
  it("ограничивает стили бланка своим классом", () => {
    const out = renderTemplate("<style>.s0{color:red}</style><p class=\"s0\">x</p>", { vars: {} }, "t0");
    expect(out).toContain(".t0 .s0{color:red}");
  });
  it("все бланки LiveSklad на месте", () => {
    expect(SEED_TEMPLATES.length).toBe(34);
    const kinds = new Set(SEED_TEMPLATES.map((t) => t.docType));
    for (const k of ["order", "sale", "receipt", "writeoff", "transfer", "inventory", "price_tag", "salary", "invoice", "client_report", "supplier_return"]) expect(kinds.has(k)).toBe(true);
    expect(pageCss({ pageSize: "custom", width: 43, height: 25, landscape: false, margins: [1, 1, 1, 0] }).size).toBe("43mm 25mm");
    expect(pageCss({ pageSize: "A4", width: null, height: null, landscape: true, margins: [] }).size).toBe("297mm 210mm");
  });
});

describe("зарплата", () => {
  const rule = { kind: "WORK", base: "PROFIT", percent: 1000, fixed: 0, minBase: 0, maxAmount: null, locationId: null, orderType: null, includeWorks: true, includeParts: true, subtractNegative: true };
  it("самое точное правило побеждает", () => {
    const rules = [
      { ...rule, id: "all" },
      { ...rule, id: "loc", locationId: "L1" },
      { ...rule, id: "locType", locationId: "L1", orderType: "Платный" },
    ];
    expect(pickRule(rules, "WORK", "L1", "Платный")?.id).toBe("locType");
    expect(pickRule(rules, "WORK", "L1", "Гарантийный")?.id).toBe("loc");
    expect(pickRule(rules, "WORK", "L2", "Платный")?.id).toBe("all");
    expect(pickRule(rules, "SALE", "L1")).toBeNull();
  });
  it("порог, максимум и отрицательная прибыль", () => {
    expect(accrue({ ...rule, minBase: 100000 }, 50000)).toBe(0);
    expect(accrue({ ...rule, minBase: 100000, fixed: 5000 }, 200000)).toBe(25000);
    expect(accrue({ ...rule, maxAmount: 10000 }, 500000)).toBe(10000);
    expect(accrue(rule, -10000)).toBe(-1000);
    expect(accrue({ ...rule, subtractNegative: false }, -10000)).toBe(0);
  });
  it("база: прибыль с учётом скидки и закупки", () => {
    const items = [
      { kind: "SERVICE", qty: 1, price: 100000, cost: 0 },
      { kind: "PART", qty: 1, price: 100000, cost: 60000 },
    ];
    expect(ruleBase(rule, items, 20000)).toBe(200000 - 20000 - 60000);
    expect(ruleBase({ ...rule, includeParts: false }, items, 20000)).toBe(100000 - 10000);
    expect(ruleBase({ ...rule, base: "REVENUE" }, items, 0)).toBe(200000);
  });
  it("расчётный лист: оклад + заказы − штраф − выплата", async () => {
    const a = await createCompany({ companyName: "З", ownerName: "Кирилл", email: `w4-${uniq()}@test.ru`, password: "password123" });
    const t = tenant(a.company.id);
    const u = a.owner.id;
    await t.db.user.update({ where: { id: u }, data: { baseSalary: 3000000 } });
    await t.db.salaryRule.create({ data: { companyId: a.company.id, userId: u, kind: "WORK", base: "REVENUE", percent: 5000 } });
    const o = await createOrder(t, { locationId: a.location.id, authorId: u, masterId: u, client: { name: "Иван", phone: "89001234567" }, deviceType: "Телефон", problem: "Экран" });
    await addService(t, o.id, u, { name: "Замена экрана", price: 200000 });
    const closed = await t.db.orderStatus.findFirstOrThrow({ where: { kind: "CLOSED" } });
    await t.db.order.update({ where: { id: o.id }, data: { statusId: closed.id, closedAt: new Date() } });
    await t.db.salaryEntry.createMany({
      data: [
        { companyId: a.company.id, userId: u, kind: "FINE", amount: 50000 },
        { companyId: a.company.id, userId: u, kind: "PAYOUT", amount: 1000000 },
      ],
    });
    const from = new Date(Date.now() - 86400000);
    const to = new Date(Date.now() + 86400000);
    const s = (await salarySheet(t.db, a.company, u, from, to))!;
    expect(s.accrued).toBe(100000);
    expect(s.total).toBe(3000000 + 100000 - 50000);
    expect(s.due).toBe(3000000 + 100000 - 50000 - 1000000);
  });
});

describe("статусы", () => {
  const from = { name: "Новый", nextIds: ["b"], denyEdit: [] as string[] };
  const to = { id: "b", name: "В работе", denySet: [] as string[], requirePayment: false, requireMaster: false, kind: "IN_PROGRESS" };
  it("цепочки, права должностей, оплата и мастер", () => {
    expect(statusRuleError(from, to, { due: 0, hasMaster: false, actor: { chains: true } })).toBeNull();
    expect(statusRuleError(from, { ...to, id: "c" }, { due: 0, hasMaster: false, actor: { chains: true } })).toMatch(/цепочка/);
    expect(statusRuleError(from, { ...to, id: "c" }, { due: 0, hasMaster: false, actor: { chains: false } })).toBeNull();
    expect(statusRuleError(from, { ...to, denySet: ["P"] }, { due: 0, hasMaster: false, actor: { positionId: "P" } })).toMatch(/нельзя ставить/);
    expect(statusRuleError(from, { ...to, denySet: ["P"] }, { due: 0, hasMaster: false, actor: { positionId: "P", owner: true } })).toBeNull();
    expect(statusRuleError({ ...from, denyEdit: ["P"] }, to, { due: 0, hasMaster: false, actor: { positionId: "P" } })).toMatch(/нельзя менять/);
    expect(statusRuleError(from, { ...to, requirePayment: true }, { due: 100, hasMaster: true })).toMatch(/должен/);
    expect(statusRuleError(from, { ...to, requireMaster: true }, { due: 0, hasMaster: false })).toMatch(/мастера/);
  });
});

describe("цены, штрихкоды и печать из базы", () => {
  it("свои цены товара, рассрочка по умолчанию, ценники и квитанция", async () => {
    const a = await createCompany({ companyName: "Ц", ownerName: "Кирилл", email: `w4p-${uniq()}@test.ru`, password: "password123" });
    const t = tenant(a.company.id);
    const types = await ensurePriceTypes(t.db, a.company.id);
    expect(types.map((x) => x.name)).toEqual(["Рассрочка"]);
    const code = await nextBarcode(a.company.id);
    expect(isEan13(code)).toBe(true);
    const p = await t.db.product.create({ data: { companyId: a.company.id, name: "iPhone 12", price: 3000000, cost: 2000000, repairPrice: null, barcode: code } });
    await saveProductPrices(t.db, a.company.id, p.id, { [types[0].id]: 3600000 });
    const full = await t.db.product.findUniqueOrThrow({ where: { id: p.id }, include: { prices: true } });
    expect(priceOf(full, types[0].id)).toBe(3600000);
    expect(priceOf(full, "repair")).toBe(3000000);
    expect(priceOf(full, "cost")).toBe(2000000);

    const tpls = await ensureTemplates(t.db, a.company.id);
    expect(tpls).toHaveLength(34);
    expect(tpls.filter((x) => x.docType === "order" && x.isDefault).map((x) => x.name)).toEqual(["Квитанция о приеме"]);

    const tags = await priceTagCtxs(t.db, a.company, a.owner, [p.id], { [p.id]: 3 });
    expect(tags).toHaveLength(3);
    const tag = tpls.find((x) => x.name === "Большой ценник")!;
    const html = renderTemplate(tag.html, tags[0], "t0");
    expect(html).toContain("<svg");
    expect(html).not.toMatch(/&lt;Наименование/);

    const o = await createOrder(t, { locationId: a.location.id, authorId: a.owner.id, client: { name: "Анна", phone: "89001112233" }, deviceType: "Телефон", brand: "Apple", model: "iPhone 12", problem: "Не заряжается" });
    await addService(t, o.id, a.owner.id, { name: "Чистка разъёма", price: 150000 });
    const ctx = (await orderCtx(t.db, a.company, a.owner, o.id))!;
    const kv = tpls.find((x) => x.name === "Квитанция о приеме")!;
    const out = renderTemplate(kv.html, ctx, "t0");
    expect(out).toContain("Анна");
    expect(out).toContain("Не заряжается");
    expect(out).toContain(`A${o.number}`);
    const act = renderTemplate(tpls.find((x) => x.name === "Акт выполненных работ")!.html, ctx, "t0");
    expect(act).toContain("Чистка разъёма");
    expect(act).toContain("Одна тысяча пятьсот рублей 00 копеек");
  });
});
