import { requireUser } from "@/lib/auth";
import { dt, Table } from "@/components/ui";
import { RowLink } from "@/components/row-link";
import { rub } from "@/lib/money";
import { DocList } from "../_ui/doc-list";

/** Возвраты от клиентов: чеки возврата по продажам. */
export default async function ReturnsPage() {
  const { db, location } = await requireUser();
  const sales = await db.sale.findMany({
    where: { isReturn: true, ...(location ? { locationId: location.id } : {}) },
    include: { items: true, warehouse: true, user: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const originals = new Map(
    (await db.sale.findMany({ where: { id: { in: sales.map((s) => s.returnOfId).filter((x): x is string => !!x) } }, select: { id: true, number: true } })).map((s) => [s.id, s.number]),
  );
  return (
    <DocList types={[]} title="Возвраты от клиентов">
      <p className="mb-3 text-sm text-slate-500">Возврат оформляется из продажи: откройте чек в «Продажи → История продаж» и нажмите «Возврат».</p>
      <div className="mb-6">
        <Table head={["Дата", "Чек возврата", "По продаже", "Склад", "Товары", "Сумма", "Кто"]} empty="Возвратов от покупателей нет">
          {sales.map((s) => (
            <RowLink key={s.id} href={`/sales/${s.id}`}>
              <td className="px-3 py-2 whitespace-nowrap text-slate-500">{dt(s.createdAt)}</td>
              <td className="px-3 py-2">№{s.number}</td>
              <td className="px-3 py-2">{s.returnOfId ? `№${originals.get(s.returnOfId) ?? ""}` : ""}</td>
              <td className="px-3 py-2">{s.warehouse?.name ?? ""}</td>
              <td className="px-3 py-2 text-slate-600">{s.items.map((i) => `${i.name} × ${i.qty}`).join(", ")}</td>
              <td className="px-3 py-2 text-red-600">{rub(s.total)}</td>
              <td className="px-3 py-2 text-slate-500">{s.user?.name}</td>
            </RowLink>
          ))}
        </Table>
      </div>
    </DocList>
  );
}
