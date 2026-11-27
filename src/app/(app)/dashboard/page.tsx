import Link from "next/link";
import { AlertTriangle, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Flame, PackageCheck, Plus, Target, TrendingDown, TrendingUp } from "lucide-react";
import { can, requireUser } from "@/lib/auth";
import { btn, dt } from "@/components/ui";
import { rub } from "@/lib/money";
import { dashboard, periodRange, planFor, type Period } from "@/lib/domain/dashboard";

const PERIODS: { key: Period; label: string; prev: string }[] = [
  { key: "day", label: "День", prev: "с предыдущим днём" },
  { key: "week", label: "Неделя", prev: "с прошлой неделей" },
  { key: "month", label: "Месяц", prev: "с прошлым месяцем" },
  { key: "quarter", label: "Квартал", prev: "с прошлым кварталом" },
  { key: "year", label: "Год", prev: "с прошлым годом" },
];

const isoDate = (d: Date) => d.toLocaleDateString("sv-SE");
const parseDate = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00") : null);

function rangeTitle(p: Period, from: Date, to: Date) {
  const last = new Date(to.getTime() - 864e5);
  if (p === "day") return from.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  if (p === "month") return from.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  if (p === "quarter") return `${Math.floor(from.getMonth() / 3) + 1} квартал ${from.getFullYear()}`;
  if (p === "year") return `${from.getFullYear()} год`;
  return `${from.toLocaleDateString("ru-RU")} — ${last.toLocaleDateString("ru-RU")}`;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ p?: string; d?: string; from?: string; to?: string; mine?: string; scope?: string }> }) {
  const sp = await searchParams;
  const { db, company, user, location, locations } = await requireUser();
  const cFrom = parseDate(sp.from);
  const cTo = parseDate(sp.to) ?? cFrom;
  const period: Period = cFrom ? "custom" : ((PERIODS.find((p) => p.key === sp.p)?.key ?? "month") as Period);
  const anchor = parseDate(sp.d) ?? new Date();
  const range = periodRange(period, anchor, cFrom && cTo ? { from: cFrom, to: cTo < cFrom ? cFrom : cTo } : undefined);
  const money = can(user, "dashboardMoney");
  const allOrders = can(user, "allOrders");
  const mine = sp.mine === "1" || !allOrders;
  const scopeAll = sp.scope !== "loc" && !user.locationId && locations.length > 1;
  const data = await dashboard(
    { db, companyId: company.id },
    { range, mine, userId: user.id, locationId: scopeAll ? undefined : location?.id },
  );
  const prevLabel = PERIODS.find((p) => p.key === period)?.prev ?? "с предыдущим периодом";
  const title = rangeTitle(period, range.from, range.to);
  const monthlyPlan = (scopeAll ? locations : locations.filter((l) => l.id === location?.id)).reduce((s, l) => s + l.planRevenue, 0);
  const plan = mine ? 0 : planFor(monthlyPlan, range.from, range.to);
  const fact = data.period.orders + data.period.sales;
  const elapsed = Math.min(1, Math.max(0, (Date.now() - +range.from) / (+range.to - +range.from)));
  const shift = (dir: number) => {
    if (period === "custom") {
      const len = +range.to - +range.from;
      return q({ from: isoDate(new Date(+range.from + dir * len)), to: isoDate(new Date(+range.to + dir * len - 864e5)), p: undefined, d: undefined });
    }
    const a = new Date(range.from);
    if (period === "day") a.setDate(a.getDate() + dir);
    if (period === "week") a.setDate(a.getDate() + 7 * dir);
    if (period === "month") a.setMonth(a.getMonth() + dir);
    if (period === "quarter") a.setMonth(a.getMonth() + 3 * dir);
    if (period === "year") a.setFullYear(a.getFullYear() + dir);
    return q({ d: isoDate(a) });
  };
  const max = Math.max(1, ...data.chart.map((c) => Math.max(c.orders, c.sales)));
  const q = (o: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const all = {
      p: period === "custom" ? undefined : period,
      d: sp.d,
      from: period === "custom" ? sp.from : undefined,
      to: period === "custom" ? sp.to : undefined,
      mine: mine && allOrders ? "1" : undefined,
      scope: sp.scope,
      ...o,
    };
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

      {/* Сроки ремонта */}
      <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DueTile icon={<AlertTriangle size={16} />} tone="red" label="Просрочено" n={data.overdue.length} />
        <DueTile icon={<CalendarClock size={16} />} tone="amber" label="Срок сегодня" n={data.dueToday.length} />
        <DueTile icon={<CalendarDays size={16} />} tone="blue" label="Срок завтра" n={data.dueTomorrow.length} />
        <DueTile icon={<PackageCheck size={16} />} tone="green" label="Готовы, ждут выдачи" n={data.readyWaiting} href="/orders?tab=ready" />
      </section>
      {(data.overdue.length > 0 || data.dueToday.length > 0 || data.dueTomorrow.length > 0 || data.urgent.length > 0) && (
        <section className="mt-4 grid gap-4 lg:grid-cols-3">
          <MiniList title="Просрочены" icon={<AlertTriangle size={16} className="text-red-500" />} list={data.overdue.slice(0, 10)} more={data.overdue.length - 10} showDue />
          <MiniList title="Сдать сегодня" icon={<CalendarClock size={16} className="text-amber-500" />} list={data.dueToday.slice(0, 10)} more={data.dueToday.length - 10} showDue />
          <MiniList
            title={data.urgent.length ? "Срочные и на завтра" : "Сдать завтра"}
            icon={<Flame size={16} className="text-orange-600" />}
            list={[...data.urgent.filter((o) => !data.overdue.includes(o) && !data.dueToday.includes(o)), ...data.dueTomorrow.filter((o) => !o.urgent)].slice(0, 10)}
            showDue
          />
        </section>
      )}
      {data.noDue > 0 && <p className="mt-2 text-xs text-slate-500">Без срока сдачи: {data.noDue} {plural(data.noDue, "заказ", "заказа", "заказов")} в работе.</p>}

      {money && (
        <>
          {/* Выбор периода */}
          <div className="mt-6 mb-3 flex flex-wrap items-center gap-2 text-sm">
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
              {PERIODS.map((p) => (
                <Link key={p.key} href={q({ p: p.key, from: undefined, to: undefined })} className={pill(p.key === period)}>
                  {p.label}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Link href={shift(-1)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Назад">
                <ChevronLeft size={16} />
              </Link>
              <span className="min-w-36 px-2 text-center font-medium text-slate-800">{title}</span>
              <Link href={shift(1)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Вперёд">
                <ChevronRight size={16} />
              </Link>
            </div>
            <form className="flex flex-wrap items-center gap-1">
              {mine && allOrders && <input type="hidden" name="mine" value="1" />}
              {sp.scope && <input type="hidden" name="scope" value={sp.scope} />}
              <input type="date" name="from" defaultValue={isoDate(range.from)} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm" aria-label="С даты" />
              <span className="text-slate-400">—</span>
              <input type="date" name="to" defaultValue={isoDate(new Date(+range.to - 864e5))} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm" aria-label="По дату" />
              <button className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-100">Показать</button>
            </form>
          </div>

          <section className="grid gap-4 lg:grid-cols-[1fr_1fr_320px]">
            <Compare title="Сегодня" prevLabel="со вчера" orders={data.today.orders} ordersPrev={data.today.ordersPrev} sales={data.today.sales} salesPrev={data.today.salesPrev} />
            <Compare title={title} prevLabel={prevLabel} orders={data.period.orders} ordersPrev={data.period.ordersPrev} sales={data.period.sales} salesPrev={data.period.salesPrev} />
            <PlanCard plan={plan} fact={fact} elapsed={elapsed} closed={data.period.closedCount} canSet={can(user, "settings")} mine={mine} />
          </section>

          <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-800">Выручка: {title}</div>
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
        </>
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
  more = 0,
}: {
  title: string;
  icon: React.ReactNode;
  more?: number;
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
      {more > 0 && <div className="pt-2 text-xs text-slate-500">и ещё {more}</div>}
    </div>
  );
}

function DueTile({ icon, label, n, tone, href }: { icon: React.ReactNode; label: string; n: number; tone: "red" | "amber" | "blue" | "green"; href?: string }) {
  const color = { red: "text-red-600", amber: "text-amber-600", blue: "text-blue-600", green: "text-green-600" }[tone];
  const body = (
    <>
      <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${n ? color : "text-slate-400"}`}>
        {icon} {label}
      </div>
      <div className={`mt-1 text-3xl font-semibold ${n ? "text-slate-900" : "text-slate-300"}`}>{n}</div>
    </>
  );
  const cls = "rounded-xl border border-slate-200 bg-white p-4";
  return href ? (
    <Link href={href} className={`${cls} transition hover:border-slate-300 hover:shadow-md`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function PlanCard({ plan, fact, elapsed, closed, canSet, mine }: { plan: number; fact: number; elapsed: number; closed: number; canSet: boolean; mine: boolean }) {
  const pct = plan > 0 ? Math.round((fact / plan) * 100) : 0;
  const expected = Math.round(plan * elapsed);
  const ahead = fact - expected;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Target size={14} /> План на период
      </div>
      {plan > 0 ? (
        <>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-semibold text-slate-900">{pct}%</div>
            <div className="text-sm text-slate-500">из {rub(plan)}</div>
          </div>
          <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${pct >= 100 ? "bg-green-500" : "bg-[#4f6bff]"}`} style={{ width: `${Math.min(100, pct)}%` }} />
            {elapsed > 0 && elapsed < 1 && <div className="absolute top-0 h-full w-0.5 bg-slate-500" style={{ left: `${elapsed * 100}%` }} title="Где должны быть сейчас" />}
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Факт</span>
              <b>{rub(fact)}</b>
            </div>
            {elapsed > 0 && elapsed < 1 && (
              <div className="flex justify-between">
                <span className="text-slate-500">{ahead >= 0 ? "Опережаем график" : "Отстаём от графика"}</span>
                <b className={ahead >= 0 ? "text-green-600" : "text-red-500"}>{rub(Math.abs(ahead))}</b>
              </div>
            )}
            {plan > fact && (
              <div className="flex justify-between">
                <span className="text-slate-500">Осталось до плана</span>
                <b>{rub(plan - fact)}</b>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Выдано заказов</span>
              <b>{closed}</b>
            </div>
          </div>
        </>
      ) : (
        <div className="text-sm text-slate-500">
          {mine ? "План считается по точке. Переключитесь на «Все»." : "План не задан."}{" "}
          {canSet && !mine && (
            <Link href="/settings/locations" className="text-blue-600 hover:underline">
              Задать план выручки
            </Link>
          )}
          <div className="mt-3 flex justify-between">
            <span>Выручка за период</span>
            <b className="text-slate-900">{rub(fact)}</b>
          </div>
        </div>
      )}
    </div>
  );
}
