import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { btn, Card, dOnly, Input, PageHeader, Stat, Table } from "@/components/ui";
import { Columns, HBars } from "@/components/charts";
import { rub } from "@/lib/money";
import { parseRange } from "@/lib/period";
import { buybackResults } from "@/lib/domain/buyback";
import { memoryLabel } from "@/lib/market/device";
import { MarketTabs } from "../tabs";

const MEDALS = ["🥇", "🥈", "🥉"];

/** Результаты выкупа: кто, что и когда выкупил, сколько заработали и какие бонусы начислены. */
export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("buyback");
  const { fromS, toS, from, to } = parseRange(sp);
  const { employees, items, total, bonusPercent } = await buybackResults({ db: ctx.db, companyId: ctx.company.id }, from, to);
  const ranked = employees.filter((e) => e.bought > 0);

  const days: { label: string; value: number; hint: string }[] = [];
  for (let d = new Date(from); d < to && days.length < 93; d = new Date(d.getTime() + 864e5)) {
    const next = new Date(d.getTime() + 864e5);
    const day = items.filter((i) => i.boughtAt >= d && i.boughtAt < next);
    const label = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    days.push({ label, value: day.length, hint: `${label}: ${day.length} шт. на ${rub(day.reduce((s, i) => s + i.buyPrice, 0))}` });
  }
  const bonusRule = [ctx.company.bonusFixed ? `${rub(ctx.company.bonusFixed)} за каждый выкуп` : "", bonusPercent ? `${bonusPercent}% от прибыли после продажи` : ""].filter(Boolean).join(" + ");

  return (
    <>
      <PageHeader title="Рынок · результаты выкупа">
        <form className="flex flex-wrap gap-2">
          <Input type="date" name="from" defaultValue={fromS} className="w-40" />
          <Input type="date" name="to" defaultValue={toS} className="w-40" />
          <button className={btn("secondary")}>Показать</button>
        </form>
      </PageHeader>
      <MarketTabs user={ctx.user} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Выкуплено" value={`${total.bought} шт.`} sub={`продано ${total.sold}`} />
        <Stat label="Потрачено на выкуп" value={rub(total.spent)} />
        <Stat label="Выручка с продажи" value={rub(total.revenue)} />
        <Stat label="Прибыль" value={<span className={total.profit < 0 ? "text-red-700" : "text-green-700"}>{rub(total.profit)}</span>} />
        <Stat label="Бонусы сотрудникам" value={rub(total.bonus)} sub={bonusRule || "бонусы не настроены"} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="Рейтинг: выкупы по сотрудникам">
          <HBars rows={ranked.map((e, i) => ({ label: `${MEDALS[i] ?? `${i + 1}.`} ${e.name}`, value: e.bought, text: `${e.bought} шт. · ${rub(e.profit)}` }))} empty="За период выкупов нет" />
        </Card>
        <Card title="Выкупы по дням">
          <Columns data={days} empty="За период выкупов нет" />
        </Card>
      </div>

      <Card title="Сотрудники" className="mb-4">
        <Table head={["Место", "Сотрудник", "Выкуплено", "Потрачено", "Продано", "Прибыль", "Бонус", "Сейчас в работе"]} empty="Сотрудников нет">
          {employees.map((r, i) => (
            <tr key={r.userId} className={r.userId === ctx.user.id ? "bg-blue-50" : ""}>
              <td className="px-3 py-2 text-lg">{r.bought > 0 ? (MEDALS[i] ?? i + 1) : "—"}</td>
              <td className="px-3 py-2 font-medium">{r.name}</td>
              <td className="px-3 py-2 text-lg font-semibold">{r.bought}</td>
              <td className="px-3 py-2">{rub(r.spent)}</td>
              <td className="px-3 py-2">{r.sold}</td>
              <td className={`px-3 py-2 ${r.profit < 0 ? "text-red-600" : "text-green-700"}`}>{rub(r.profit)}</td>
              <td className="px-3 py-2 font-semibold">{rub(r.bonus)}</td>
              <td className="px-3 py-2 text-slate-500">{r.inWork}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="Что выкупили">
        <Table head={["Дата", "Техника", "Кто", "Выкупили за", "Продали за", "Прибыль", "Бонус"]} empty="За период выкупов нет">
          {items.map((i) => (
            <tr key={i.id}>
              <td className="whitespace-nowrap px-3 py-2">{dOnly(i.boughtAt)}</td>
              <td className="px-3 py-2">
                <Link href={`/market/search/${i.id}`} className="hover:underline">
                  {i.model ? `${i.model}${i.memoryGb ? ` ${memoryLabel(i.memoryGb)}` : ""}` : i.title}
                </Link>
              </td>
              <td className="px-3 py-2">{i.userName}</td>
              <td className="px-3 py-2">{rub(i.buyPrice)}</td>
              <td className="px-3 py-2">{i.sold ? rub(i.revenue) : <span className="text-slate-500">на складе</span>}</td>
              <td className={`px-3 py-2 ${i.profit < 0 ? "text-red-600" : i.sold ? "text-green-700" : "text-slate-500"}`}>{i.sold ? rub(i.profit) : "—"}</td>
              <td className="px-3 py-2">{rub(i.bonus)}</td>
            </tr>
          ))}
        </Table>
        <p className="mt-2 text-xs text-slate-500">Прибыль и бонус с процента появляются, когда выкупленную технику продали через раздел «Продажи».</p>
      </Card>
    </>
  );
}
