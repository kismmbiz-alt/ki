import { can, requirePermission } from "@/lib/auth";
import { btn, Input, PageHeader, Table } from "@/components/ui";
import { rub } from "@/lib/money";
import { buybackRating } from "@/lib/domain/buyback";
import { BuybackTabs } from "../tabs";

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function RatingPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("buyback");
  const now = new Date();
  const monthS = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [y, m] = monthS.split("-").map(Number);
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 1);
  const rows = await buybackRating({ db: ctx.db, companyId: ctx.company.id }, from, to);
  const showMoney = can(ctx.user, "reports");
  const total = rows.reduce((s, r) => s + r.bought, 0);
  const monthName = from.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader title="Скупка техники">
        <form className="flex gap-2">
          <Input type="month" name="m" defaultValue={monthS} className="w-44" />
          <button className={btn("secondary")}>Показать</button>
        </form>
      </PageHeader>
      <BuybackTabs admin={can(ctx.user, "buybackSources")} />
      <p className="mb-3 text-sm text-slate-600">
        Рейтинг за {monthName}: всего выкуплено <b>{total}</b> шт. Место считается по количеству выкупов, при равенстве — по прибыли с перепродажи.
      </p>
      <Table head={["Место", "Сотрудник", "Выкуплено", ...(showMoney ? ["Потрачено", "Продано", "Прибыль с продажи"] : []), "Сейчас в работе"]} empty="Сотрудников нет">
        {rows.map((r, i) => (
          <tr key={r.userId} className={r.userId === ctx.user.id ? "bg-blue-50" : ""}>
            <td className="px-3 py-2 text-lg">{r.bought > 0 ? (MEDALS[i] ?? i + 1) : "—"}</td>
            <td className="px-3 py-2 font-medium">{r.name}</td>
            <td className="px-3 py-2 text-lg font-semibold">{r.bought}</td>
            {showMoney && (
              <>
                <td className="px-3 py-2">{rub(r.spent)}</td>
                <td className="px-3 py-2">{r.sold}</td>
                <td className={`px-3 py-2 ${r.profit < 0 ? "text-red-600" : "text-green-700"}`}>{rub(r.profit)}</td>
              </>
            )}
            <td className="px-3 py-2 text-slate-500">{r.inWork}</td>
          </tr>
        ))}
      </Table>
      <p className="mt-2 text-xs text-slate-500">Прибыль считается, когда выкупленную технику продали через раздел «Продажи».</p>
    </>
  );
}
