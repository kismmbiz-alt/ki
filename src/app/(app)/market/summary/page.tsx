import Link from "next/link";
import { PeriodPicker } from "@/components/period-picker";
import { requirePermission } from "@/lib/auth";
import { btn, Card, Input, PageHeader, Stat, Table } from "@/components/ui";
import { HBars } from "@/components/charts";
import { rub } from "@/lib/money";
import { parseRange } from "@/lib/period";
import { periodReport } from "@/lib/domain/reports";
import { buybackResults } from "@/lib/domain/buyback";
import { TRANSFER_CATEGORY } from "@/lib/domain/cash";
import { MarketTabs } from "../tabs";

/** Эти расходы — вложения в товар (вернутся с продажей) или движение денег, а не траты бизнеса. */
const NOT_COSTS = new Set(["Закупка запчастей", "Выкуп техники", "Инкассация", "Возврат продажи", TRANSFER_CATEGORY]);

/** Сводка для руководителя: сколько заработали, на что потратили, ремонты, выкупы и чистый итог. */
export default async function SummaryPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("marketSummary");
  const t = { db: ctx.db, companyId: ctx.company.id };
  const { fromS, toS, from, to } = parseRange(sp);

  const [rep, buy, expenses, users] = await Promise.all([
    periodReport(t, from, to),
    buybackResults(t, from, to),
    ctx.db.cashTransaction.findMany({ where: { createdAt: { gte: from, lt: to }, amount: { lt: 0 }, transferId: null }, select: { amount: true, category: true, userId: true } }),
    ctx.db.user.findMany({ select: { id: true, name: true } }),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.name]));

  const byCategory = new Map<string, number>();
  const byManager = new Map<string, { name: string; total: number; cats: Map<string, number> }>();
  for (const e of expenses) {
    const sum = -e.amount;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + sum);
    const key = e.userId ?? "-";
    const m = byManager.get(key) ?? { name: e.userId ? (userName.get(e.userId) ?? "Сотрудник") : "Без сотрудника", total: 0, cats: new Map() };
    m.total += sum;
    m.cats.set(e.category, (m.cats.get(e.category) ?? 0) + sum);
    byManager.set(key, m);
  }
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const managers = [...byManager.values()].sort((a, b) => b.total - a.total);
  const costs = categories.filter(([c]) => !NOT_COSTS.has(c)).reduce((s, [, v]) => s + v, 0);
  const salary = rep.masters.reduce((s, m) => s + m.salary, 0);

  const earned = rep.ordersProfit + rep.salesProfit;
  const net = earned - costs - buy.total.bonus;

  const iso = (d: Date) => d.toLocaleDateString("sv-SE");
  const now = new Date();
  const presets = [
    { label: "Сегодня", from: iso(now), to: iso(now) },
    { label: "Этот месяц", from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) },
    { label: "Прошлый месяц", from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) },
    { label: "С начала года", from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) },
  ];

  return (
    <>
      <PageHeader title="Рынок · сводка">
        <form className="flex flex-wrap gap-2">
          <PeriodPicker from={fromS} to={toS} clearable={false} />
          <button className={btn("secondary")}>Показать</button>
        </form>
      </PageHeader>
      <MarketTabs user={ctx.user} />
      <div className="mb-4 flex flex-wrap gap-1">
        {presets.map((p) => (
          <Link key={p.label} href={`/market/summary?from=${p.from}&to=${p.to}`} className={btn(p.from === fromS && p.to === toS ? "primary" : "secondary")}>
            {p.label}
          </Link>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Заработано (прибыль)" value={<span className="text-green-700">{rub(earned)}</span>} sub={`выручка ${rub(rep.ordersRevenue + rep.salesRevenue)}`} />
        <Stat label="Расходы бизнеса" value={<span className="text-red-700">{rub(costs)}</span>} sub="аренда, зарплата, реклама и т.п." />
        <Stat label="Бонусы за выкуп" value={rub(buy.total.bonus)} />
        <Stat label="Итого чистыми" value={<span className={net < 0 ? "text-red-700" : "text-green-700"}>{rub(net)}</span>} sub="прибыль − расходы − бонусы" />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card title="Ремонты">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Принято" value={rep.acceptedCount} />
            <Stat label="Выдано" value={rep.closedCount} />
            <Stat label="Выручка" value={rub(rep.ordersRevenue)} />
            <Stat label="Прибыль" value={rub(rep.ordersProfit)} />
          </div>
          {salary > 0 && <p className="mt-2 text-xs text-slate-500">Зарплата мастеров с ремонтов: {rub(salary)}</p>}
        </Card>
        <Card title="Продажи">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Выручка" value={rub(rep.salesRevenue)} />
            <Stat label="Прибыль" value={rub(rep.salesProfit)} />
          </div>
          <p className="mt-2 text-xs text-slate-500">Сюда входит и перепродажа выкупленной техники.</p>
        </Card>
        <Card title="Выкупы">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Выкуплено" value={`${buy.total.bought} шт.`} sub={`продано ${buy.total.sold}`} />
            <Stat label="Потрачено" value={rub(buy.total.spent)} />
            <Stat label="Продали за" value={rub(buy.total.revenue)} />
            <Stat label="Прибыль" value={rub(buy.total.profit)} />
          </div>
        </Card>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="На что потратили">
          <HBars
            rows={categories.map(([c, v]) => ({ label: NOT_COSTS.has(c) ? `${c} (вложение)` : c, value: v, text: rub(v) }))}
            empty="Расходов за период нет"
          />
          <p className="mt-3 text-xs text-slate-500">«Вложение» — деньги ушли в товар и вернутся с продажей, в расходы бизнеса не считаются.</p>
        </Card>
        <Card title="Кто сколько потратил">
          <HBars
            rows={managers.map((m) => ({
              label: m.name,
              value: m.total,
              text: rub(m.total),
              hint: [...m.cats.entries()].map(([c, v]) => `${c}: ${rub(v)}`).join("\n"),
            }))}
            empty="Расходов за период нет"
          />
        </Card>
      </div>

      <Card title="Расходы по сотрудникам и статьям">
        <Table head={["Сотрудник", "Статья", "Сумма"]} empty="Расходов за период нет">
          {managers.flatMap((m) =>
            [...m.cats.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([c, v], i) => (
                <tr key={`${m.name}-${c}`}>
                  <td className="px-3 py-2 font-medium">{i === 0 ? m.name : ""}</td>
                  <td className="px-3 py-2">{c}</td>
                  <td className="px-3 py-2">{rub(v)}</td>
                </tr>
              )),
          )}
        </Table>
      </Card>
    </>
  );
}
