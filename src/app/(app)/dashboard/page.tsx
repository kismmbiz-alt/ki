import Link from "next/link";
import { AlertTriangle, Flame, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { can, requireUser } from "@/lib/auth";
import { btn, dt } from "@/components/ui";
import { rub } from "@/lib/money";
import { dashboard, type Period } from "@/lib/domain/dashboard";

const PERIODS: { key: Period; label: string; now: string; prev: string }[] = [
  { key: "week", label: "Неделя", now: "Эта неделя", prev: "с прошлой неделей" },
  { key: "month", label: "Месяц", now: "Этот месяц", prev: "с прошлым месяцем" },
  { key: "year", label: "Год", now: "Этот год", prev: "с прошлым годом" },
];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ p?: string; mine?: string; scope?: string }> }) {
  const sp = await searchParams;
  const { db, company, user, location, locations } = await requireUser();
  const period = (PERIODS.find((p) => p.key === sp.p)?.key ?? "week") as Period;
  const allOrders = can(user.role, "allOrders");
  const mine = sp.mine === "1" || !allOrders;
  const scopeAll = sp.scope !== "loc" && !user.locationId && locations.length > 1;
  const data = await dashboard(
    { db, companyId: company.id },
    { period, mine, userId: user.id, locationId: scopeAll ? undefined : location?.id },
  );
  const P = PERIODS.find((p) => p.key === period)!;
  const max = Math.max(1, ...data.chart.map((c) => Math.max(c.orders, c.sales)));
  const q = (o: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const all = { p: period, mine: mine && allOrders ? "1" : undefined, scope: sp.scope, ...o };
    for (const [k, v] of Object.entries(all)) if (v) u.set(k, v);
    return `/dashboard?${u}`;
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm">
          {allOrders && (
            <>
              <Link href={q({ mine: undefined })} className={pill(!mine)}>
                Все
              </Link>
              <Link href={q({ mine: "1" })} className={pill(mine)}>
                Мои
              </Link>
            </>
          )}
          {locations.length > 1 && !user.locationId && (
            <>
              <span className="mx-1 h-5 w-px bg-slate-200" />
              <Link href={q({ scope: undefined })} className={pill(scopeAll)}>
                Компания
              </Link>
              <Link href={q({ scope: "loc" })} className={pill(!scopeAll)}>
                {location?.name ?? "Точка"}
              </Link>
            </>
          )}
        </div>
        <Link href="/orders/new" className={btn()}>
          <Plus size={16} /> Новый заказ
        </Link>
      </div>

      <section className="grid gap-4 lg:grid-cols-[180px_1fr]">
        <div className="flex flex-row gap-6 rounded-xl border border-slate-200 bg-white p-5 lg:flex-col lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Заказов сегодня</div>
            <div className="mt-1 text-4xl font-semibold text-slate-900">{data.todayCount}</div>
          </div>
          <div>
            <div className="text-4xl font-semibold text-slate-900">{data.notIssued}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Не выдано</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {data.funnel.map((f) => (
            <Link
              key={f.key}
              href={`/orders?tab=${f.key}`}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-md"
            >
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: f.color }} />
              <div className="flex items-baseline justify-between">
                <div className="font-medium text-slate-800">{f.label}</div>
              </div>
              <div className="mt-1 h-4 text-xs text-slate-500">{f.sum > 0 ? `≈ ${rub(f.sum)}${f.key === "closed" ? " за период" : ""}` : ""}</div>
              <div className="mt-4 text-3xl font-semibold text-slate-900">{f.count}</div>
              <div className="text-xs text-slate-500">{plural(f.count, "заказ", "заказа", "заказов")}</div>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-6 mb-3 flex flex-wrap items-center gap-1 text-sm">
        {PERIODS.map((p) => (
          <Link key={p.key} href={q({ p: p.key })} className={pill(p.key === period)}>
            {p.label}
          </Link>
        ))}
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <Compare title="Сегодня" prevLabel="со вчера" orders={data.today.orders} ordersPrev={data.today.ordersPrev} sales={data.today.sales} salesPrev={data.today.salesPrev} />
        <Compare title={P.now} prevLabel={P.prev} orders={data.period.orders} ordersPrev={data.period.ordersPrev} sales={data.period.sales} salesPrev={data.period.salesPrev} />
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-800">Выручка: {P.now.toLowerCase()}</div>
          <div className="flex gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-sm bg-[#4f6bff]" /> Заказы
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-sm bg-[#22c55e]" /> Продажи
            </span>
          </div>
        </div>
        <div className="scroll-thin flex h-48 items-end gap-1 overflow-x-auto">
          {data.chart.map((c, i) => (
            <div key={i} className="flex h-full min-w-[18px] flex-1 flex-col items-center justify-end gap-1" title={`Заказы ${rub(c.orders)} · Продажи ${rub(c.sales)}`}>
              <div className="flex h-full w-full items-end justify-center gap-0.5">
                <div className="w-1/2 max-w-4 rounded-t bg-[#4f6bff]" style={{ height: `${(c.orders / max) * 100}%`, opacity: c.future ? 0.3 : 1 }} />
                <div className="w-1/2 max-w-4 rounded-t bg-[#22c55e]" style={{ height: `${(c.sales / max) * 100}%`, opacity: c.future ? 0.3 : 1 }} />
              </div>
              <div className="text-[10px] text-slate-400">{c.label}</div>
            </div>
          ))}
        </div>
      </section>

      {(data.overdue.length > 0 || data.urgent.length > 0) && (
        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <MiniList title="Просрочены" icon={<AlertTriangle size={16} className="text-red-500" />} list={data.overdue} showDue />
          <MiniList title="Срочные" icon={<Flame size={16} className="text-orange-600" />} list={data.urgent} />
        </section>
      )}
    </>
  );
}

const pill = (on: boolean) => `rounded-md px-3 py-1.5 ${on ? "bg-blue-600 on-accent" : "text-slate-600 hover:bg-slate-100"}`;

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10,
    m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function Compare(p: { title: string; prevLabel: string; orders: number; ordersPrev: number; sales: number; salesPrev: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{p.title}</div>
      <Row label="Заказы" value={p.orders} prev={p.ordersPrev} prevLabel={p.prevLabel} />
      <Row label="Продажи" value={p.sales} prev={p.salesPrev} prevLabel={p.prevLabel} />
    </div>
  );
}

function Row({ label, value, prev, prevLabel }: { label: string; value: number; prev: number; prevLabel: string }) {
  const diff = value - prev;
  const up = diff >= 0;
  return (
    <div className="grid grid-cols-[80px_1fr_1fr] items-center gap-3 border-t border-slate-100 py-3 first-of-type:border-t-0">
      <div className="text-sm text-slate-500">{label}</div>
      <div>
        <div className="text-2xl font-semibold text-slate-900">{rub(value)}</div>
        <div className="text-xs text-slate-400">сумма</div>
      </div>
      <div>
        <div className={`flex items-center gap-1 text-lg font-semibold ${up ? "text-green-600" : "text-red-500"}`}>
          {up ? "+" : "−"}
          {rub(Math.abs(diff))} {up ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
        </div>
        <div className="text-xs text-slate-400">по сравнению {prevLabel}</div>
      </div>
    </div>
  );
}

function MiniList({
  title,
  icon,
  list,
  showDue,
}: {
  title: string;
  icon: React.ReactNode;
  list: { id: string; number: number; dueDate: Date | null; brand: string | null; model: string | null; deviceType: string; client: { name: string }; status: { name: string; color: string } }[];
  showDue?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
        {icon} {title}
      </div>
      {list.length === 0 && <div className="py-3 text-sm text-slate-400">Нет</div>}
      <ul className="divide-y divide-slate-100">
        {list.map((o) => (
          <li key={o.id}>
            <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-blue-600">
              <span className="min-w-0 truncate">
                <b>№{o.number}</b> · {[o.brand, o.model].filter(Boolean).join(" ") || o.deviceType} · <span className="text-slate-500">{o.client.name}</span>
              </span>
              <span className={`shrink-0 text-xs ${showDue ? "text-red-500" : "text-slate-500"}`}>{showDue ? dt(o.dueDate) : o.status.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
