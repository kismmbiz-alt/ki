import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { Card, dt, PageHeader, Table } from "@/components/ui";
import { rub } from "@/lib/money";
import { DOC_LABEL } from "@/lib/domain/stock";
import { PrintMenu } from "@/components/order-widgets";
import { printMenu } from "@/lib/print/templates";

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, company } = await requirePermission("stock");
  const d = await db.stockDoc.findUnique({ where: { id }, include: { items: true, location: true, toLocation: true, warehouse: true, toWarehouse: true, supplier: true } });
  if (!d) notFound();
  const user = d.userId ? await db.user.findUnique({ where: { id: d.userId } }) : null;
  const print = await printMenu(db, company.id, "stock", d.type);
  return (
    <>
      <PageHeader title={`${DOC_LABEL[d.type]} №${d.number}`} back={`/stock/${({ RECEIPT: "receipts", TRANSFER: "transfers", WRITEOFF: "writeoffs", INVENTORY: "inventory", SUPPLIER_RETURN: "supplier-returns" } as const)[d.type]}`}>
        <PrintMenu templates={print.templates} defaults={print.defaults} query={`doc=${d.id}`} />
        {d.items.length > 0 && (
          <a href={`/print/t?products=${d.items.map((i) => i.productId).join(",")}&qty=${d.items.map((i) => Math.max(1, Math.abs(i.qty))).join(",")}`} target="_blank" className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Ценники на товары
          </a>
        )}
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Table head={["Товар", d.type === "INVENTORY" ? "Разница" : "Кол-во", "Закупка за шт", "Сумма"]} empty="Нет строк">
          {d.items.map((i) => (
            <tr key={i.id}>
              <td className="px-3 py-2">{i.name}</td>
              <td className={`px-3 py-2 font-medium ${i.qty < 0 ? "text-red-600" : ""}`}>{d.type === "INVENTORY" && i.qty > 0 ? `+${i.qty}` : i.qty}</td>
              <td className="px-3 py-2">{rub(i.cost)}</td>
              <td className="px-3 py-2">{rub(i.cost * i.qty)}</td>
            </tr>
          ))}
        </Table>
        <Card title="Документ">
          <dl className="space-y-1 text-sm">
            <div>Дата: {dt(d.createdAt)}</div>
            <div>
              Склад: {d.warehouse.name} · {d.location.name}
            </div>
            {d.toWarehouse && (
              <div>
                Куда: {d.toWarehouse.name} · {d.toLocation?.name}
              </div>
            )}
            {d.supplier && <div>Поставщик: {d.supplier.name}</div>}
            {d.comment && <div>Комментарий: {d.comment}</div>}
            <div>Провёл: {user?.name ?? "—"}</div>
            <div className="pt-2 font-semibold">Итого по закупке: {rub(d.total)}</div>
          </dl>
        </Card>
      </div>
    </>
  );
}
