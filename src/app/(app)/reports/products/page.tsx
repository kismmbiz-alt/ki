import Link from "next/link";
import { PeriodPicker } from "@/components/period-picker";
import { can, requirePermission } from "@/lib/auth";
import { btn, Input, PageHeader, Select, Stat } from "@/components/ui";
import { rub } from "@/lib/money";
import { flattenGroups, indentLabel, withDescendants } from "@/lib/domain/groups";
import { productSales, salesTree } from "@/lib/domain/product-sales";
import { ReportsTabs } from "../_tabs";

type SP = { from?: string; to?: string; loc?: string; g?: string; p?: string; src?: string };

/** Какие товары и в каком количестве продаются: группа → подгруппа → товар. */
export default async function ProductSalesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { db, user } = await requirePermission("reports");
  const now = new Date();
  const fromS = sp.from ?? new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("sv-SE");
  const toS = sp.to ?? now.toLocaleDateString("sv-SE");
  const from = new Date(fromS + "T00:00:00");
  const to = new Date(new Date(toS + "T00:00:00").getTime() + 864e5);
  const src = sp.src ?? "all";
  const showProducts = sp.p !== "0";
  const showCost = can(user, "cost");

  const [locs, groups] = await Promise.all([db.location.findMany({ orderBy: { createdAt: "asc" } }), db.productGroup.findMany({ select: { id: true, name: true, parentId: true } })]);
  let rows = await productSales(db, from, to, { locationId: sp.loc || undefined, sales: src !== "orders", orders: src !== "sales" });
  if (sp.g === "none") rows = rows.filter((r) => !r.groupId);
  else if (sp.g) {
    const ids = new Set(withDescendants(groups, sp.g));
    rows = rows.filter((r) => r.groupId && ids.has(r.groupId));
  }
  const lines = salesTree(rows, groups, showProducts);
  const total = rows.reduce((a, r) => ({ qty: a.qty + r.qty, revenue: a.revenue + r.revenue, cost: a.cost + r.cost }), { qty: 0, revenue: 0, cost: 0 });
  const top = [...rows].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, 10);
  const stock = new Map(
    (await db.stock.groupBy({ by: ["productId"], where: { productId: { in: rows.map((r) => r.productId) } }, _sum: { qty: true } })).map((s) => [s.productId, s._sum.qty ?? 0]),
  );
  const pct = (v: number) => (total.revenue > 0 ? `${Math.round((v / total.revenue) * 1000) / 10}%` : "");
  const qs = (o: Partial<SP>) => `/reports/products?${new URLSearchParams(Object.entries({ ...sp, ...o }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <>
      <PageHeader title="Продажи товаров" />
      <ReportsTabs />
      <form className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
        <PeriodPicker from={fromS} to={toS} clearable={false} />
        <Select name="loc" defaultValue={sp.loc ?? ""}>
          <option value="">Все точки</option>
          {locs.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <Select name="g" defaultValue={sp.g ?? ""}>
          <option value="">Все группы</option>
          <option value="none">Без группы</option>
          {flattenGroups(groups).map((g) => (
            <option key={g.id} value={g.id}>
              {indentLabel(g.name, g.depth)}
            </option>
          ))}
        </Select>
        <Select name="src" defaultValue={src}>
          <option value="all">Продажи и заказы</option>
          <option value="sales">Только продажи</option>
          <option value="orders">Только запчасти в заказах</option>
        </Select>
        <Select name="p" defaultValue={showProducts ? "1" : "0"}>
          <option value="1">Группы и товары</option>
          <option value="0">Только группы</option>
        </Select>
        <button className={btn("secondary")}>Показать</button>
      </form>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Продано, шт" value={total.qty} sub={`${rows.length} наименований`} />
        <Stat label="Выручка" value={rub(total.revenue)} />
        {showCost && <Stat label="Прибыль" value={rub(total.revenue - total.cost)} sub={`себестоимость ${rub(total.cost)}`} />}
        {top[0] && <Stat label="Лучше всего продаётся" value={<span className="text-base">{top[0].name}</span>} sub={`${top[0].qty} шт на ${rub(top[0].revenue)}`} />}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Группа / товар</th>
                <th className="px-3 py-2.5 text-right font-medium">Продано, шт</th>
                <th className="px-3 py-2.5 text-right font-medium">Выручка</th>
                <th className="px-3 py-2.5 text-right font-medium">Доля</th>
                {showCost && <th className="px-3 py-2.5 text-right font-medium">Прибыль</th>}
                <th className="px-3 py-2.5 text-right font-medium">Сейчас на складе</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
                <tr key={`${l.kind}-${l.id}`} className={l.kind === "group" ? (l.depth === 0 ? "bg-slate-50 font-semibold" : "font-medium") : ""}>
                  <td className="px-3 py-2" style={{ paddingLeft: 12 + l.depth * 18 }}>
                    {l.kind === "group" ? (
                      <Link href={qs({ g: l.id })} className="text-slate-900 hover:text-blue-600">
                        {l.name}
                      </Link>
                    ) : (
                      <Link href={`/stock/${l.id}`} className="text-slate-600 hover:text-blue-600">
                        {l.name}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{l.qty}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{rub(l.revenue)}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{pct(l.revenue)}</td>
                  {showCost && <td className={`px-3 py-2 text-right whitespace-nowrap ${l.revenue - l.cost < 0 ? "text-red-600" : ""}`}>{rub(l.revenue - l.cost)}</td>}
                  <td className="px-3 py-2 text-right text-slate-500">{l.kind === "product" ? (stock.get(l.id) ?? 0) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!lines.length && <p className="p-10 text-center text-sm text-slate-400">За этот период продаж товаров нет</p>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
          <div className="mb-2 font-medium text-slate-700">Топ-10 по количеству</div>
          <ol className="space-y-1.5">
            {top.map((r, i) => (
              <li key={r.productId} className="flex items-baseline gap-2">
                <span className="w-5 shrink-0 text-right text-xs text-slate-400">{i + 1}.</span>
                <Link href={`/stock/${r.productId}`} className="min-w-0 flex-1 truncate text-slate-700 hover:text-blue-600">
                  {r.name}
                </Link>
                <span className="shrink-0 font-medium">{r.qty} шт</span>
              </li>
            ))}
          </ol>
          {!top.length && <p className="text-slate-400">Нет продаж</p>}
          <p className="mt-3 text-xs text-slate-400">Учитываются чеки продаж минус возвраты и запчасти в заказах, выданных за период. Скидка на чек делится по строкам.</p>
        </div>
      </div>
    </>
  );
}
