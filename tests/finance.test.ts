import { beforeAll, describe, expect, it } from "vitest";
import { execSync } from "child_process";
import { tenant } from "@/lib/db";
import { createCompany } from "@/lib/domain/company";
import { addCashTransaction, cashboxBalances, deleteCashTx, editCashTx } from "@/lib/domain/cash";
import { findTxs } from "@/lib/domain/cash-list";
import { salaryPeriods } from "@/lib/domain/salary";
import { periodLabel, presets } from "@/lib/period-presets";

const uniq = () => Math.random().toString(36).slice(2, 8);
beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: process.env, stdio: "ignore" });
});

describe("финансы как в LiveSklad", () => {
  it("правка и удаление операции с историей, остаток после операции, итоги", async () => {
    const a = await createCompany({ companyName: "Фин", ownerName: "Кирилл", email: `f-${uniq()}@test.ru`, password: "password123" });
    const t = tenant(a.company.id);
    const box = await t.db.cashbox.findFirstOrThrow();
    const base = { locationId: a.location.id, cashboxId: box.id, userId: a.owner.id };
    await addCashTransaction(t, { ...base, amount: 100000, method: "CASH", category: "Внесение в кассу" });
    const out = await addCashTransaction(t, { ...base, amount: -30000, method: "CASH", category: "Хоз. товары", recipientId: a.owner.id });
    await addCashTransaction(t, { ...base, amount: 5000, method: "CARD", category: "Прочий приход" });
    let r = await findTxs(t.db, [box.id], {});
    expect(r.rows.map((x) => x.balance)).toEqual([75000, 70000, 100000]);
    expect(r.totals.cash).toEqual({ in: 100000, out: -30000 });
    expect(r.rows[1].recipient?.label).toBe("Кирилл");

    await editCashTx(t, out.id, a.owner.id, { category: "Аренда", comment: "ноябрь", amount: 40000, createdAt: out.createdAt, eventDate: null, recipientId: null, method: "CASH" });
    expect((await cashboxBalances(t, [box.id])).get(box.id)!.total).toBe(65000);
    expect((await findTxs(t.db, [box.id], { st: "edited" })).rows).toHaveLength(1);

    await deleteCashTx(t, out.id, a.owner.id);
    expect((await cashboxBalances(t, [box.id])).get(box.id)!.total).toBe(105000);
    const del = await findTxs(t.db, [box.id], { st: "deleted" });
    expect(del.rows[0].shown).toBe(-40000);
    expect((await t.db.cashTxLog.findMany({ where: { txId: out.id } })).map((l) => l.action)).toEqual(["CREATE", "EDIT", "DELETE"]);
    r = await findTxs(t.db, [box.id], {});
    expect(r.count).toBe(2);
  });

  it("периоды зарплаты и быстрые периоды дат", () => {
    const now = new Date(2026, 10, 27);
    const m = salaryPeriods({ salaryPeriodType: "MONTH", salaryPeriodCount: 1, salaryPeriodStart: null }, new Date(2026, 2, 10), now);
    expect(m.map((p) => p.label)[0]).toBe("ноябрь 2026");
    expect(m).toHaveLength(9);
    const w = salaryPeriods({ salaryPeriodType: "WEEK", salaryPeriodCount: 2, salaryPeriodStart: new Date(2026, 10, 2) }, now, now);
    expect(w).toHaveLength(2);
    const last = presets(now).find((p) => p.key === "lastMonth")!.range();
    expect(last.map((d) => d.getDate())).toEqual([1, 31]);
    expect(periodLabel("2026-10-01", "2026-10-31", now)).toBe("Прошлый месяц");
    expect(periodLabel("2026-10-05", "2026-10-07", now)).toBe("05.10.2026 – 07.10.2026");
  });
});
