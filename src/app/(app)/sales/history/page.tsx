import { requirePermission } from "@/lib/auth";
import { dt, Input, PageHeader, Table } from "@/components/ui";
import { RowLink } from "@/components/row-link";
import { rub } from "@/lib/money";
import { PAY_LABEL } from "@/lib/domain/cash";
import { SalesTabs } from "../_tabs";

export default async function SalesHistory({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { day } = await searchParams;
  const { db, location } = await requirePermission("sales");
  const from = day ? new Date(day + "T00:00:00") : null;
  const sales = await db.sale.findMany({
    where: { ...(location ? { locationId: location.id } : {}), ...(from ? { createdAt: { gte: from, lt: new Date(from.getTime() + 864e5) } } : {}) },
    include: { items: true, user: true, client: true, transactions: { select: { method: true } } },
    orderBy: { number: "desc" },
    take: 300,
  });
  return (
    <>
      <PageHeader title={`Продажи · ${location?.name ?? ""}`}>
        <form className="flex gap-2">
          <Input type="date" name="day" defaultValue={day} className="w-44" />
          <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">Показать</button>
        </form>
      </PageHeader>
      <SalesTabs />
      <Table head={["№", "Дата", "Товары", "Клиент", "Оплата", "Сумма", "Продавец"]} empty="Продаж нет">
        {sales.map((s) => (
          <RowLink key={s.id} href={`/sales/${s.id}`}>
            <td className="px-3 py-2 font-medium">
              {s.number}
              {s.isReturn && <span className="ml-2 rounded bg-red-50 px-1.5 text-xs text-red-600">возврат</span>}
            </td>
            <td className="px-3 py-2 whitespace-nowrap text-slate-500">{dt(s.createdAt)}</td>
            <td className="max-w-md px-3 py-2">
              <div className="line-clamp-2">{s.items.map((i) => `${i.name} × ${i.qty}`).join(", ")}</div>
            </td>
            <td className="px-3 py-2 text-slate-600">{s.client?.name}</td>
            <td className="px-3 py-2 text-slate-500">{s.transactions[0] ? PAY_LABEL[s.transactions[0].method] : ""}</td>
            <td className={`px-3 py-2 font-medium ${s.total < 0 ? "text-red-600" : ""}`}>{rub(s.total)}</td>
            <td className="px-3 py-2 text-slate-500">{s.user?.name}</td>
          </RowLink>
        ))}
      </Table>
    </>
  );
}
