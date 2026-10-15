import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { can, requireUser } from "@/lib/auth";
import { btn, Badge, dOnly, dt, Input, PageHeader, Table } from "@/components/ui";

import { rub } from "@/lib/money";
import { normalizePhone, totals } from "@/lib/domain/orders";

const TABS = [
  { key: "active", label: "В работе" },
  { key: "ready", label: "Готовы" },
  { key: "closed", label: "Закрытые" },
  { key: "all", label: "Все" },
];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; status?: string }> }) {
  const sp = await searchParams;
  const { db, user, location } = await requireUser();
  const tab = sp.tab ?? "active";
  const q = sp.q?.trim();

  const where: Prisma.OrderWhereInput = {};
  if (location) where.locationId = location.id;
  if (!can(user.role, "allOrders")) where.masterId = user.id;
  if (sp.status) where.statusId = sp.status;
  else if (tab === "active") where.status = { kind: { in: ["NEW", "IN_PROGRESS", "WAITING"] } };
  else if (tab === "ready") where.status = { kind: "READY" };
  else if (tab === "closed") where.status = { kind: { in: ["CLOSED", "CANCELED"] } };
  if (q) {
    const num = /^\d+$/.test(q) ? parseInt(q, 10) : undefined;
    const phone = normalizePhone(q);
    where.OR = [
      ...(num ? [{ number: num }] : []),
      { client: { name: { contains: q, mode: "insensitive" } } },
      ...(phone.length > 4 ? [{ client: { phone: { contains: phone.slice(-7) } } }] : []),
      { model: { contains: q, mode: "insensitive" } },
      { brand: { contains: q, mode: "insensitive" } },
      { serial: { contains: q, mode: "insensitive" } },
    ];
  }

  const [list, statuses] = await Promise.all([
    db.order.findMany({
      where,
      include: { client: true, status: true, master: true, items: true, payments: { select: { amount: true } } },
      orderBy: { number: "desc" },
      take: 200,
    }),
    db.orderStatus.findMany({ orderBy: { sort: "asc" } }),
  ]);
  const now = new Date();

  return (
    <>
      <PageHeader title="Заказы">
        <Link href="/orders/new" className={btn()}>
          + Новый заказ
        </Link>
      </PageHeader>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/orders?tab=${t.key}`}
            className={`rounded-full px-3 py-1 text-sm ${tab === t.key && !sp.status ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200"}`}
          >
            {t.label}
          </Link>
        ))}
        <form className="ml-auto flex gap-2">
          <input type="hidden" name="tab" value={tab} />
          <select name="status" defaultValue={sp.status ?? ""} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
            <option value="">Любой статус</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Input name="q" defaultValue={q} placeholder="№, телефон, имя, модель, серийник" className="w-64" />
          <button className={btn("secondary")}>Найти</button>
        </form>
      </div>
      <Table head={["№", "Принят", "Клиент", "Устройство", "Статус", "Мастер", "Срок", "Сумма", "Долг"]} empty="Заказов нет">
        {list.map((o) => {
          const t = totals(o.items, o.payments.reduce((s, p) => s + p.amount, 0));
          const overdue = o.dueDate && o.dueDate < now && !["CLOSED", "CANCELED", "READY"].includes(o.status.kind);
          return (
            <tr key={o.id} className="hover:bg-slate-50">
              <td className="px-3 py-2 font-medium">
                <Link href={`/orders/${o.id}`} className="text-blue-600 hover:underline">
                  {o.number}
                </Link>
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-500">{dt(o.createdAt)}</td>
              <td className="px-3 py-2">
                <div>{o.client.name}</div>
                <div className="text-xs text-slate-500">{o.client.phone}</div>
              </td>
              <td className="px-3 py-2">
                <Link href={`/orders/${o.id}`} className="hover:underline">
                  {[o.deviceType, o.brand, o.model].filter(Boolean).join(" ")}
                </Link>
                <div className="max-w-xs truncate text-xs text-slate-500">{o.problem}</div>
              </td>
              <td className="px-3 py-2">
                <Badge color={o.status.color}>{o.status.name}</Badge>
              </td>
              <td className="px-3 py-2 text-slate-600">{o.master?.name ?? "—"}</td>
              <td className={`whitespace-nowrap px-3 py-2 ${overdue ? "font-medium text-red-600" : "text-slate-500"}`}>{dOnly(o.dueDate)}</td>
              <td className="whitespace-nowrap px-3 py-2">{t.total ? rub(t.total) : o.estimatedPrice ? `~${rub(o.estimatedPrice)}` : "—"}</td>
              <td className={`whitespace-nowrap px-3 py-2 ${t.due > 0 ? "text-red-600" : "text-slate-400"}`}>{t.due > 0 ? rub(t.due) : "—"}</td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
