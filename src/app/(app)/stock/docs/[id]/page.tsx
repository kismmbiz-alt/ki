import { notFound } from "next/navigation";
import Link from "next/link";
import { can, requirePermission } from "@/lib/auth";
import { Form, Submit } from "@/components/form";
import { placesFor } from "@/lib/domain/places";
import { payStockDocAction } from "../../actions";
import { Card, dt, Input, PageHeader, Select, Table } from "@/components/ui";
import { rub } from "@/lib/money";
import { DOC_LABEL, docDebt } from "@/lib/domain/stock";
import { maskPhone } from "@/lib/domain/bonus";
import { PrintMenu } from "@/components/order-widgets";
import { printMenu } from "@/lib/print/templates";

export default async function DocPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ payErr?: string }> }) {
  const { id } = await params;
  const { payErr } = await searchParams;
  const ctx = await requirePermission("stock");
  const { db, company } = ctx;
  const d = await db.stockDoc.findUnique({ where: { id }, include: { items: true, location: true, toLocation: true, warehouse: true, toWarehouse: true, supplier: true, client: true } });
  if (!d) notFound();
  const user = d.userId ? await db.user.findUnique({ where: { id: d.userId } }) : null;
  const print = await printMenu(db, company.id, "stock", d.type);
  const responsible = d.responsibleId && d.responsibleId !== d.userId ? await db.user.findUnique({ where: { id: d.responsibleId } }) : user;
  const isReceipt = d.type === "RECEIPT";
  const debt = docDebt(d);
  const payments = isReceipt ? await db.cashTransaction.findMany({ where: { locationId: d.locationId, comment: { startsWith: `Поступление №${d.number}` } }, include: { cashbox: true, user: true }, orderBy: { createdAt: "asc" } }) : [];
  const canPay = isReceipt && debt > 0 && can(ctx.user, "stockDocs") && can(ctx.user, "cashOps");
  const { cashboxes } = canPay ? await placesFor({ db, companyId: company.id }, d.locationId, ctx.user) : { cashboxes: [] };
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
              <td className="px-3 py-2">
                <Link href={`/stock/${i.productId}`} className="text-blue-600 hover:underline">
                  {i.name}
                </Link>
                {i.serials && <div className="mt-0.5 font-mono text-xs whitespace-pre-line text-slate-500">S/N: {i.serials.split("\n").join(", ")}</div>}
              </td>
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
            {d.supplier && (
              <div>
                Поставщик:{" "}
                <Link href={`/stock/suppliers/${d.supplier.id}`} className="text-blue-600">
                  {d.supplier.name}
                </Link>
              </div>
            )}
            {d.client && (
              <div>
                От клиента:{" "}
                <Link href={`/clients/${d.client.id}`} className="text-blue-600">
                  {d.client.name}
                </Link>{" "}
                <span className="text-slate-500">{can(ctx.user, "clientContacts") ? d.client.phone : maskPhone(d.client.phone)}</span>
              </div>
            )}
            {d.inDocNo && (
              <div>
                Вход. документ: №{d.inDocNo}
                {d.inDocDate ? ` от ${d.inDocDate.toLocaleDateString("ru-RU")}` : ""}
              </div>
            )}
            {responsible && responsible.id !== user?.id && <div>Ответственный: {responsible.name}</div>}
            {d.comment && <div>Комментарий: {d.comment}</div>}
            <div>Провёл: {user?.name ?? "—"}</div>
            <div className="pt-2 font-semibold">Итого по закупке: {rub(d.total)}</div>
            {isReceipt && d.total > 0 && (
              <>
                <div>Оплачено: {rub(d.paid)}</div>
                {debt > 0 ? <div className="font-semibold text-red-600">Мы должны: {rub(debt)}</div> : <div className="font-medium text-green-600">Оплачено полностью</div>}
              </>
            )}
          </dl>
        </Card>
      </div>
      {payErr && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Поступление создано, но оплата не записана: {payErr}</p>}
      {isReceipt && (payments.length > 0 || canPay) && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]">
          <Table head={["Дата", "Оплата", "Касса", "Сумма", "Сотрудник"]} empty="Оплат пока нет">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2 whitespace-nowrap text-slate-500">{dt(p.createdAt)}</td>
                <td className="px-3 py-2">{p.category}</td>
                <td className="px-3 py-2">{p.cashbox.name}</td>
                <td className="px-3 py-2 font-medium">{rub(-p.amount)}</td>
                <td className="px-3 py-2 text-slate-500">{p.user?.name}</td>
              </tr>
            ))}
          </Table>
          {canPay && (
            <Card title="Оплатить товар">
              <Form action={payStockDocAction} className="space-y-2">
                <input type="hidden" name="docId" value={d.id} />
                <Input name="amount" inputMode="decimal" defaultValue={String(debt / 100)} required />
                <Select name="cashboxId">
                  {cashboxes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <Select name="method" defaultValue="CASH">
                  <option value="CASH">Наличные</option>
                  <option value="CARD">Карта</option>
                  <option value="TRANSFER">Перевод</option>
                </Select>
                <Submit className="w-full">Оплатить</Submit>
              </Form>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
