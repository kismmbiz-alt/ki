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

export type SalaryRow = {
  date: Date;
  label: string;
  base: number;
  amount: number;
  /** WORK — за выполненную работу, SALE — за продажу */
  kind?: "WORK" | "SALE";
  href?: string;
  number?: string;
  client?: string | null;
  items?: { name: string; qty: number }[];
  /** как посчитано: «7% от 360 руб», «200 руб и 2% от 9 000 руб», «50 руб (фикс.)» */
  formula?: string;
};

const r2 = (k: number) => (k / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 });

/** Расшифровка начисления по правилу, как в событиях зарплаты LiveSklad. */
export function formulaText(rule: Pick<RuleInput, "percent" | "fixed" | "maxAmount">, base: number, amount: number) {
  const parts: string[] = [];
  if (rule.fixed) parts.push(`${r2(rule.fixed)} руб`);
  if (rule.percent) parts.push(`${rule.percent / 100}% от ${r2(base)} руб`);
  let t = parts.length === 1 && !rule.percent ? `${parts[0]} (фикс.)` : parts.join(" и ");
  if (rule.maxAmount != null && amount === rule.maxAmount) t += `, не более ${r2(rule.maxAmount)} руб`;
  return t;
}

/** Расчётный лист сотрудника за период. */
export async function salarySheet(db: TenantDb, company: Pick<Company, "id">, userId: string, from: Date, to: Date, locationId?: string | null) {
  const u = await db.user.findUnique({ where: { id: userId }, include: { salaryRules: true } });
  if (!u) return null;
  const rows: SalaryRow[] = [];
  const workRules = u.salaryRules.filter((r) => r.kind === "WORK");
  const saleRules = u.salaryRules.filter((r) => r.kind === "SALE");

  const loc = locationId ? { locationId } : {};
  const orders = await db.order.findMany({ where: { ...loc, masterId: userId, closedAt: { gte: from, lt: to }, status: { kind: "CLOSED" } }, include: { items: true, client: { select: { name: true } } } });
  for (const o of orders) {
    const t = totals(o.items, 0, o);
    const rule = pickRule(workRules, "WORK", o.locationId, o.orderType);
    if (rule) {
      const base = ruleBase(rule, o.items, t.discount);
      const amount = accrue(rule, base);
      if (amount)
        rows.push({
          date: o.closedAt!,
          label: `Заказ A${o.number}`,
          base,
          amount,
          kind: "WORK",
          href: `/orders/${o.id}`,
          number: `A${o.number}`,
          client: o.client?.name,
          items: o.items.filter((i) => (i.kind === "SERVICE" ? rule.includeWorks : rule.includeParts)).map((i) => ({ name: i.name, qty: i.qty })),
          formula: formulaText(rule, base, amount),
        });
    } else if (!workRules.length && u.salaryPercent) {
      // старое правило: процент от работ
      const amount = Math.round((t.services * u.salaryPercent) / 100);
      if (amount)
        rows.push({
          date: o.closedAt!,
          label: `Заказ A${o.number}`,
          base: t.services,
          amount,
          kind: "WORK",
          href: `/orders/${o.id}`,
          number: `A${o.number}`,
          client: o.client?.name,
          items: o.items.filter((i) => i.kind === "SERVICE").map((i) => ({ name: i.name, qty: i.qty })),
          formula: `${u.salaryPercent}% от ${r2(t.services)} руб`,
        });
    }
  }

  if (saleRules.length) {
    const sales = await db.sale.findMany({ where: { ...loc, userId, createdAt: { gte: from, lt: to } }, include: { items: true, client: { select: { name: true } } } });
    for (const s of sales) {
      const rule = pickRule(saleRules, "SALE", s.locationId);
      if (!rule) continue;
      if (s.isReturn && rule.keepOnReturn) continue;
      const items = s.items.map((i) => ({ kind: "PART", qty: Math.abs(i.qty), price: i.price, cost: i.cost }));
      let base = ruleBase({ ...rule, includeParts: true }, items, s.discount);
      if (s.isReturn) base = -Math.abs(base);
      const amount = s.isReturn ? -Math.abs(accrue({ ...rule, subtractNegative: true, minBase: 0 }, Math.abs(base))) : accrue(rule, base);
      if (amount)
        rows.push({
          date: s.createdAt,
          label: s.isReturn ? `Возврат ${s.number}` : `Продажа B${s.number}`,
          base,
          amount,
          kind: "SALE",
          href: `/sales/${s.id}`,
          number: `B${s.number}`,
          client: s.client?.name,
          items: s.items.map((i) => ({ name: i.name, qty: Math.abs(i.qty) })),
          formula: formulaText(rule, Math.abs(base), Math.abs(amount)),
        });
    }
  }

  const entries = await db.salaryEntry.findMany({ where: { userId, date: { gte: from, lt: to }, ...(locationId ? { OR: [{ locationId }, { locationId: null }] } : {}) }, orderBy: { date: "asc" } });
  const sum = (k: string) => entries.filter((e) => e.kind === k).reduce((s, e) => s + e.amount, 0);
  const accrued = rows.reduce((s, r) => s + r.amount, 0);
  const bonus = sum("BONUS");
  const fine = sum("FINE");
  const paid = sum("PAYOUT");
  // оклад задан в месяц: за неделю — пропорционально дням
  const days = Math.round((to.getTime() - from.getTime()) / 864e5);
  const weeks = days % 7 === 0 && days < 28 ? days / 7 : 0;
  const salary = weeks ? Math.round((u.baseSalary * days) / 30) : days >= 56 ? u.baseSalary * Math.round(days / 30.4) : u.baseSalary;
  const total = salary + accrued + bonus - fine;
  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { user: u, rows, entries, salary, accrued, bonus, fine, paid, total, due: total - paid };
}

// ---- расчётные периоды ----

export type SalaryPeriod = { key: string; from: Date; to: Date; label: string; short: string };
const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

/** Периоды зарплаты по настройкам компании: месяц(ы) или неделя(и) от даты начала, от новых к старым. */
export function salaryPeriods(c: { salaryPeriodType: string; salaryPeriodCount: number; salaryPeriodStart: Date | null }, firstData: Date, now = new Date()): SalaryPeriod[] {
  const n = Math.max(1, c.salaryPeriodCount || 1);
  const start0 = c.salaryPeriodStart ?? new Date(firstData.getFullYear(), firstData.getMonth(), 1);
  const out: SalaryPeriod[] = [];
  const fmt = (d: Date) => d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  let from = new Date(start0.getFullYear(), start0.getMonth(), start0.getDate());
  for (let i = 0; i < 520 && from <= now; i++) {
    const to = c.salaryPeriodType === "WEEK" ? new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7 * n) : new Date(from.getFullYear(), from.getMonth() + n, from.getDate());
    const last = new Date(to.getTime() - 864e5);
    const monthly = c.salaryPeriodType !== "WEEK" && n === 1 && from.getDate() === 1;
    out.push({
      key: from.toLocaleDateString("sv-SE"),
      from,
      to,
      label: monthly ? `${MONTHS[from.getMonth()]} ${from.getFullYear()}` : `${fmt(from)} – ${fmt(last)}.${last.getFullYear()}`,
      short: monthly ? MONTHS[from.getMonth()][0].toUpperCase() + MONTHS[from.getMonth()].slice(1) : `${fmt(from)}–${fmt(last)}`,
    });
    from = to;
  }
  return out.reverse();
}

/** С какой даты есть данные для зарплаты: первые продажи, заказы или записи. */
export async function salaryFirstDate(db: TenantDb, fallback: Date) {
  const [s, o, e] = await Promise.all([
    db.sale.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    db.order.findFirst({ where: { closedAt: { not: null } }, orderBy: { closedAt: "asc" }, select: { closedAt: true } }),
    db.salaryEntry.findFirst({ orderBy: { date: "asc" }, select: { date: true } }),
  ]);
  return new Date(Math.min(fallback.getTime(), s?.createdAt.getTime() ?? Infinity, o?.closedAt?.getTime() ?? Infinity, e?.date.getTime() ?? Infinity));
}
