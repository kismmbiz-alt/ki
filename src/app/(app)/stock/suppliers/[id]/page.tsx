import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requirePermission } from "@/lib/auth";
import { btn, Card, dt, Field, Input, PageHeader, Stat, Table } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { rub } from "@/lib/money";
import { DOC_LABEL, docDebt } from "@/lib/domain/stock";
import { saveSupplierAction } from "../../actions";
import { StockTabs } from "../../_ui/tabs";

/** Карточка поставщика как карточка контрагента в LiveSklad: профиль, действия, операции и баланс «мы должны». */
export default async function SupplierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ op?: string }> }) {
  const { id } = await params;
  const { op = "all" } = await searchParams;
  const ctx = await requirePermission("stock");
  const s = await ctx.db.supplier.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
  if (!s) notFound();
  const docs = await ctx.db.stockDoc.findMany({
    where: { supplierId: id, type: { in: ["RECEIPT", "SUPPLIER_RETURN"] } },
    include: { location: true, warehouse: true },
    orderBy: { createdAt: "desc" },
  });
  const receipts = docs.filter((d) => d.type === "RECEIPT");
  const returns = docs.filter((d) => d.type === "SUPPLIER_RETURN");
  const bought = receipts.reduce((a, d) => a + d.total, 0);
  const paid = receipts.reduce((a, d) => a + d.paid, 0);
  const returned = returns.reduce((a, d) => a + Math.abs(d.total), 0);
  const debt = receipts.reduce((a, d) => a + docDebt(d), 0);
  const unpaid = receipts.filter((d) => docDebt(d) > 0).reverse();
  const shown = op === "receipts" ? receipts : op === "returns" ? returns : op === "debt" ? unpaid : docs;
  const edit = can(ctx.user, "stockDocs");
  const products = await ctx.db.product.findMany({ where: { supplierId: id }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 30 });
  const tab = (k: string, label: string) => (
    <Link href={`?op=${k}`} className={`rounded-lg px-3 py-1.5 text-sm ${op === k ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader title={s.name} back="/stock/suppliers">
        {edit && (
          <>
            <Link href={`/stock/docs/new?type=RECEIPT&supplier=${s.id}`} className={btn()}>
              Новое поступление
            </Link>
            <Link href={`/stock/docs/new?type=SUPPLIER_RETURN&supplier=${s.id}`} className={btn("secondary")}>
              Возврат поставщику
            </Link>
          </>
        )}
      </PageHeader>
      <StockTabs />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Закуплено" value={rub(bought)} sub={`${receipts.length} поступлений`} />
        <Stat label="Оплачено" value={rub(paid)} />
        <Stat label="Возвращено" value={rub(returned)} sub={`${returns.length} возвратов`} />
        <Stat label="Баланс" value={<span className={debt > 0 ? "text-red-600" : "text-emerald-600"}>{debt > 0 ? `Мы должны ${rub(debt)}` : "Долга нет"}</span>} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {tab("all", "Все операции")}
            {tab("receipts", "Поступления")}
            {tab("returns", "Возвраты")}
            {tab("debt", `Не оплачено${unpaid.length ? ` (${unpaid.length})` : ""}`)}
          </div>
          <Table head={["Дата", "Операция", "Документ", "Склад", "Сумма", "Оплачено", "Долг"]} empty="Операций пока нет">
            {shown.map((d) => (
              <tr key={d.id}>
                <td className="px-3 py-2 whitespace-nowrap">{dt(d.createdAt)}</td>
                <td className="px-3 py-2">{DOC_LABEL[d.type]}</td>
                <td className="px-3 py-2">
                  <Link href={`/stock/docs/${d.id}`} className="text-blue-600 hover:underline">
                    №{d.number}
                  </Link>
                  {d.inDocNo && <span className="ml-1 text-xs text-slate-400">вх. {d.inDocNo}</span>}
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {d.warehouse.name} · {d.location.name}
                </td>
                <td className="px-3 py-2">{rub(d.type === "SUPPLIER_RETURN" ? -Math.abs(d.total) : d.total)}</td>
                <td className="px-3 py-2">{d.type === "RECEIPT" ? rub(d.paid) : "—"}</td>
                <td className="px-3 py-2">
                  {d.type === "RECEIPT" && docDebt(d) > 0 ? (
                    <Link href={`/stock/docs/${d.id}`} className="font-medium text-red-600 hover:underline">
                      {rub(docDebt(d))} · оплатить
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <p className="text-sm text-slate-500">
            Всего документов – {shown.length}, на сумму {rub(shown.reduce((a, d) => a + (d.type === "SUPPLIER_RETURN" ? -Math.abs(d.total) : d.total), 0))}
          </p>
        </div>
        <div className="space-y-4">
          <Card title="Профиль">
            {edit ? (
              <Form action={saveSupplierAction} resetOnOk={false} className="space-y-2">
                <input type="hidden" name="id" value={s.id} />
                <Field label="Название">
                  <Input name="name" defaultValue={s.name} required />
                </Field>
                <Field label="Телефон">
                  <Input name="phone" defaultValue={s.phone ?? ""} />
                </Field>
                <Field label="Заметки: сайт, условия, реквизиты">
                  <Input name="notes" defaultValue={s.notes ?? ""} />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isActive" value="1" defaultChecked={s.isActive} /> Активен
                </label>
                <Submit>Сохранить</Submit>
              </Form>
            ) : (
              <dl className="space-y-1 text-sm">
                <div>Телефон: {s.phone ?? "—"}</div>
                <div>Заметки: {s.notes ?? "—"}</div>
              </dl>
            )}
            <p className="mt-3 text-xs text-slate-400">Добавлен {dt(s.createdAt)}</p>
          </Card>
          <Card title={`Товары поставщика (${s._count.products})`}>
            <ul className="space-y-1 text-sm">
              {products.map((p) => (
                <li key={p.id}>
                  <Link href={`/stock/${p.id}`} className="text-blue-600 hover:underline">
                    {p.name}
                  </Link>
                </li>
              ))}
              {!products.length && <li className="text-slate-400">Не указан ни у одного товара</li>}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
