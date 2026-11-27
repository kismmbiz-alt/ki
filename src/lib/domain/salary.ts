// Зарплата как в LiveSklad: оклад + начисления по правилам (за продажу, за выполненную работу)
// + бонусы − штрафы − выплаты.

import type { Company, SalaryRule } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { totals } from "./orders";

export type RuleInput = Pick<SalaryRule, "kind" | "base" | "percent" | "fixed" | "minBase" | "maxAmount" | "locationId" | "orderType" | "includeWorks" | "includeParts" | "subtractNegative">;

/** Самое точное правило: точка+тип заказа > точка > тип заказа > все. */
export function pickRule<R extends RuleInput>(rules: R[], kind: "SALE" | "WORK", locationId: string, orderType?: string | null): R | null {
  const fit = rules.filter((r) => r.kind === kind && (!r.locationId || r.locationId === locationId) && (!r.orderType || r.orderType === orderType));
  const score = (r: R) => (r.locationId ? 2 : 0) + (r.orderType ? 1 : 0);
  return fit.sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** Начисление по правилу от базы (выручка или валовая прибыль), коп. */
export function accrue(rule: RuleInput, base: number) {
  if (base < 0) return rule.subtractNegative ? Math.round((base * rule.percent) / 10000) : 0;
  if (base < rule.minBase) return 0;
  let a = rule.fixed + Math.round((base * rule.percent) / 10000);
  if (rule.maxAmount != null) a = Math.min(a, rule.maxAmount);
  return a;
}

type Line = { kind: string; qty: number; price: number; cost: number };

/** База для правила по позициям документа с учётом скидки (скидка делится пропорционально). */
export function ruleBase(rule: RuleInput, items: Line[], discount: number) {
  const pick = items.filter((i) => (i.kind === "SERVICE" ? rule.includeWorks : rule.includeParts));
  const all = items.reduce((s, i) => s + i.qty * i.price, 0);
  const rev = pick.reduce((s, i) => s + i.qty * i.price, 0);
  const cost = pick.filter((i) => i.kind !== "SERVICE").reduce((s, i) => s + i.qty * i.cost, 0);
  const disc = all ? Math.round((discount * rev) / all) : 0;
  return rule.base === "REVENUE" ? rev - disc : rev - disc - cost;
}

export type SalaryRow = { date: Date; label: string; base: number; amount: number };

/** Расчётный лист сотрудника за период. */
export async function salarySheet(db: TenantDb, company: Pick<Company, "id">, userId: string, from: Date, to: Date) {
  const u = await db.user.findUnique({ where: { id: userId }, include: { salaryRules: true } });
  if (!u) return null;
  const rows: SalaryRow[] = [];
  const workRules = u.salaryRules.filter((r) => r.kind === "WORK");
  const saleRules = u.salaryRules.filter((r) => r.kind === "SALE");

  const orders = await db.order.findMany({ where: { masterId: userId, closedAt: { gte: from, lt: to }, status: { kind: "CLOSED" } }, include: { items: true } });
  for (const o of orders) {
    const t = totals(o.items, 0, o);
    const rule = pickRule(workRules, "WORK", o.locationId, o.orderType);
    if (rule) {
      const base = ruleBase(rule, o.items, t.discount);
      const amount = accrue(rule, base);
      if (amount) rows.push({ date: o.closedAt!, label: `Заказ A${o.number}`, base, amount });
    } else if (!workRules.length && u.salaryPercent) {
      // старое правило: процент от работ
      const amount = Math.round((t.services * u.salaryPercent) / 100);
      if (amount) rows.push({ date: o.closedAt!, label: `Заказ A${o.number}`, base: t.services, amount });
    }
  }

  if (saleRules.length) {
    const sales = await db.sale.findMany({ where: { userId, createdAt: { gte: from, lt: to } }, include: { items: true } });
    for (const s of sales) {
      const rule = pickRule(saleRules, "SALE", s.locationId);
      if (!rule) continue;
      if (s.isReturn && rule.keepOnReturn) continue;
      const items = s.items.map((i) => ({ kind: "PART", qty: Math.abs(i.qty), price: i.price, cost: i.cost }));
      let base = ruleBase({ ...rule, includeParts: true }, items, s.discount);
      if (s.isReturn) base = -Math.abs(base);
      const amount = s.isReturn ? -Math.abs(accrue({ ...rule, subtractNegative: true, minBase: 0 }, Math.abs(base))) : accrue(rule, base);
      if (amount) rows.push({ date: s.createdAt, label: s.isReturn ? `Возврат ${s.number}` : `Продажа B${s.number}`, base, amount });
    }
  }

  const entries = await db.salaryEntry.findMany({ where: { userId, date: { gte: from, lt: to } }, orderBy: { date: "asc" } });
  const sum = (k: string) => entries.filter((e) => e.kind === k).reduce((s, e) => s + e.amount, 0);
  const accrued = rows.reduce((s, r) => s + r.amount, 0);
  const bonus = sum("BONUS");
  const fine = sum("FINE");
  const paid = sum("PAYOUT");
  const salary = u.baseSalary;
  const total = salary + accrued + bonus - fine;
  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { user: u, rows, entries, salary, accrued, bonus, fine, paid, total, due: total - paid };
}
