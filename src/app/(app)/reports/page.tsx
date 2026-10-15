import { requirePermission } from "@/lib/auth";
import { btn, Input, PageHeader, Select, Stat, Table } from "@/components/ui";

import { rub } from "@/lib/money";
import { periodReport } from "@/lib/domain/reports";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; loc?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("reports");
  const now = new Date();
  const fromS = sp.from ?? new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("sv-SE");
  const toS = sp.to ?? now.toLocaleDateString("sv-SE");
  const from = new Date(fromS + "T00:00:00");
  const to = new Date(new Date(toS + "T00:00:00").getTime() + 864e5);
  const locs = await ctx.db.location.findMany({ orderBy: { createdAt: "asc" } });
  const r = await periodReport({ db: ctx.db, companyId: ctx.company.id }, from, to, sp.loc || undefined);

  return (
    <>
      <PageHeader title="Отчёты">
        <form className="flex flex-wrap gap-2">
          <Input type="date" name="from" defaultValue={fromS} className="w-40" />
          <Input type="date" name="to" defaultValue={toS} className="w-40" />
          <Select name="loc" defaultValue={sp.loc ?? ""} className="w-44">
            <option value="">Все точки</option>
            {locs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <button className={btn("secondary")}>Показать</button>
        </form>
      </PageHeader>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Выручка по выданным заказам" value={rub(r.ordersRevenue)} sub={`прибыль ${rub(r.ordersProfit)} (без учёта зарплаты)`} />
        <Stat label="Продажи товаров" value={rub(r.salesRevenue)} sub={`прибыль ${rub(r.salesProfit)}`} />
        <Stat label="Заказы" value={`${r.acceptedCount} принято`} sub={`${r.closedCount} выдано`} />
        <Stat label="Деньги в кассе" value={rub(r.income - r.expense)} sub={`приход ${rub(r.income)} · расход ${rub(r.expense)}`} />
      </div>
      <h2 className="mb-2 text-sm font-semibold text-slate-700">Зарплата мастеров за период</h2>
      <Table head={["Мастер", "Выдано заказов", "Сумма работ", "Процент", "К выплате"]} empty="Нет выданных заказов с назначенным мастером">
        {r.masters.map((m) => (
          <tr key={m.name}>
            <td className="px-3 py-2">{m.name}</td>
            <td className="px-3 py-2">{m.orders}</td>
            <td className="px-3 py-2">{rub(m.services)}</td>
            <td className="px-3 py-2">{m.percent}%</td>
            <td className="px-3 py-2 font-medium">{rub(m.salary)}</td>
          </tr>
        ))}
      </Table>
      <p className="mt-2 text-xs text-slate-500">Зарплата считается как процент мастера от стоимости работ (без запчастей) по заказам, выданным за период.</p>
    </>
  );
}
