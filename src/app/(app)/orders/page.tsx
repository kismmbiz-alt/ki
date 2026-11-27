import Link from "next/link";
import { Download, Filter, Flame, Plus, Search } from "lucide-react";
import { can, requireUser } from "@/lib/auth";
import { btn, Badge, dt, Input, Select } from "@/components/ui";
import { RowLink } from "@/components/row-link";
import { rub } from "@/lib/money";
import { totals } from "@/lib/domain/orders";
import { hiddenStatusIds, ORDER_TABS, orderWhere, pastDeadline, type OrderFilter } from "@/lib/domain/order-filter";
import { FUNNEL } from "@/lib/domain/dashboard";
import { loadDictionaries } from "@/lib/domain/dict";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<OrderFilter> }) {
  const sp = await searchParams;
  const { db, user, location, company } = await requireUser();
  const tab = ORDER_TABS.some((t) => t.key === sp.tab) ? sp.tab! : "open";
  const scope = { locationId: location?.id, onlyMasterId: can(user, "allOrders") ? undefined : user.id, hideStatusIds: await hiddenStatusIds(db, user) };
  const where = orderWhere({ ...sp, tab }, scope);
  const baseWhere = orderWhere({ ...sp, tab, status: undefined }, scope, { ignoreTab: true });

  const [list, statuses, staff, kindCounts, dicts] = await Promise.all([
    db.order.findMany({
      where,
      include: { client: true, status: true, master: true, manager: true, items: true, payments: { select: { amount: true } } },
      orderBy: [{ urgent: "desc" }, { number: "desc" }],
      take: 300,
    }),
    db.orderStatus.findMany({ orderBy: { sort: "asc" } }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.order.groupBy({ by: ["statusId"], where: baseWhere, _count: true }),
    loadDictionaries({ db, companyId: company.id }),
  ]);
  const kindOf = new Map(statuses.map((s) => [s.id, s.kind]));
  const byKind = new Map<string, number>();
  for (const c of kindCounts) byKind.set(kindOf.get(c.statusId)!, (byKind.get(kindOf.get(c.statusId)!) ?? 0) + c._count);
  const tabCount = (kinds?: string[]) => (kinds ? kinds.reduce((s, k) => s + (byKind.get(k) ?? 0), 0) : [...byKind.values()].reduce((a, b) => a + b, 0));

  const now = new Date();
  const filtersOn = !!(sp.status || sp.master || sp.manager || sp.type || sp.urgent || sp.overdue || sp.from || sp.to);
  const qs = (extra: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...extra })) if (v) u.set(k, v);
    return u.toString();
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Заказы</h1>
        <div className="flex gap-2">
          <a href={`/orders/export?${qs({ tab })}`} className={btn("secondary")}>
            <Download size={16} /> Экспорт
          </a>
          <Link href="/orders/new" className={btn()}>
            <Plus size={16} /> Создать
          </Link>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-1 gap-y-2">
        <form className="relative mr-2">
          <input type="hidden" name="tab" value={tab} />
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <Input name="q" defaultValue={sp.q} placeholder="№, телефон, имя, модель, IMEI" className="w-72 pl-9" />
        </form>
        {ORDER_TABS.map((t) => {
          const n = tabCount(t.kinds);
          const on = tab === t.key && !sp.status;
          return (
            <Link
              key={t.key}
              href={`/orders?${qs({ tab: t.key, status: undefined })}`}
              className={`flex items-center gap-1.5 border-b-2 px-2.5 py-1.5 text-sm ${on ? "border-blue-600 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            >
              {t.label}
              {n > 0 && t.key !== "all" && t.key !== "closed" && <span className="rounded bg-slate-100 px-1.5 text-xs text-slate-600">{n}</span>}
            </Link>
          );
        })}
      </div>

      <details className="mb-3 rounded-xl border border-slate-200 bg-white" open={filtersOn}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm text-slate-600">
          <Filter size={15} /> Фильтры {filtersOn && <span className="rounded bg-blue-50 px-1.5 text-xs text-blue-700">включены</span>}
        </summary>
        <form className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-3 lg:grid-cols-6">
          <input type="hidden" name="tab" value={tab} />
          {sp.q && <input type="hidden" name="q" value={sp.q} />}
          <Select name="status" defaultValue={sp.status ?? ""}>
            <option value="">Любой статус</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select name="master" defaultValue={sp.master ?? ""}>
            <option value="">Любой мастер</option>
            <option value="none">Мастер не назначен</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select name="manager" defaultValue={sp.manager ?? ""}>
            <option value="">Любой менеджер</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select name="type" defaultValue={sp.type ?? ""}>
            <option value="">Любой тип заказа</option>
            {dicts.ORDER_TYPE.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
          <Input name="from" type="date" defaultValue={sp.from} title="Принят с" />
          <Input name="to" type="date" defaultValue={sp.to} title="Принят по" />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="urgent" value="1" defaultChecked={sp.urgent === "1"} /> Только срочные
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="overdue" value="1" defaultChecked={sp.overdue === "1"} /> Просроченные
          </label>
          <div className="flex gap-2 lg:col-span-4 lg:justify-end">
            <Link href={`/orders?tab=${tab}`} className={btn("secondary")}>
              Сбросить
            </Link>
            <button className={btn()}>Применить</button>
          </div>
        </form>
      </details>

      <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
            <tr>
              {["Заказ", "Статус", "Крайний срок", "Менеджер", "Тип заказа", "Устройство", "Неисправность", "Клиент", "Мастер", "Сумма"].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((o) => {
              const t = totals(o.items, o.payments.reduce((s, p) => s + p.amount, 0), o);
              const open = ["NEW", "IN_PROGRESS", "WAITING"].includes(o.status.kind);
              const overdue = o.dueDate && o.dueDate < now && open;
              return (
                <RowLink key={o.id} href={`/orders/${o.id}`}>
                  <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-900">
                    <span className="flex items-center gap-1">
                      {o.urgent && <Flame size={14} className="text-orange-600" />}
                      {o.number}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge color={o.status.color}>{o.status.name}</Badge>
                    {pastDeadline(o) && <span className="ml-1 text-xs font-medium text-red-600" title="Заказ дольше дедлайна в этом статусе">просрочен</span>}
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2.5 ${overdue ? "font-medium text-red-600" : "text-slate-500"}`}>{dt(o.dueDate)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <div className="text-slate-800">{o.manager?.name ?? ""}</div>
                    <div className="text-xs text-slate-500">{dt(o.createdAt)}</div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{o.orderType}</td>
                  <td className="px-3 py-2.5">
                    <div className="text-slate-900">{[o.brand, o.model].filter(Boolean).join(" ") || o.deviceType}</div>
                    <div className="text-xs text-slate-500">{[o.deviceType, o.color].filter(Boolean).join(", ")}</div>
                  </td>
                  <td className="max-w-[220px] px-3 py-2.5">
                    <div className="line-clamp-2 text-slate-700">{o.problem}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`/clients/${o.client.id}`} className="text-blue-600 hover:underline">
                      {o.client.name}
                    </Link>
                    <div className="whitespace-nowrap text-xs text-slate-500">{o.client.phone}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{o.master?.name ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    {t.due > 0 && <div className="font-medium text-red-600">{rub(t.due)}</div>}
                    <div className="text-slate-600">{t.total ? rub(t.total) : o.estimatedPrice ? `~${rub(o.estimatedPrice)}` : "—"}</div>
                  </td>
                </RowLink>
              );
            })}
          </tbody>
        </table>
        {!list.length && <p className="p-10 text-center text-sm text-slate-400">Заказов нет</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm">
          <div className="text-slate-500">
            Показано: <b className="text-slate-800">{list.length}</b>
          </div>
          <div className="flex flex-wrap gap-4 text-slate-500">
            {FUNNEL.filter((f) => f.key !== "closed").map((f) => (
              <span key={f.key} className="flex items-center gap-1.5">
                <i className="h-2 w-2 rounded-full" style={{ background: f.color }} />
                {f.label} <b className="text-slate-800">{tabCount(f.kinds)}</b>
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
