import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { can, requirePermission } from "@/lib/auth";
import { btn, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { cashCategories, isEditableTx } from "@/lib/domain/cash";
import { rub } from "@/lib/money";
import { deleteTxAction, editTxAction } from "../../actions";

const ymd = (d: Date | null | undefined) => (d ? d.toLocaleDateString("sv-SE") : "");
const ACT = {
  CREATE: { label: "Создание", icon: <Plus size={18} />, color: "bg-sky-500" },
  EDIT: { label: "Изменение", icon: <Pencil size={16} />, color: "bg-amber-500" },
  DELETE: { label: "Удаление", icon: <Trash2 size={16} />, color: "bg-red-500" },
} as Record<string, { label: string; icon: React.ReactNode; color: string }>;

/** Карточка транзакции как в LiveSklad: поля операции слева, история изменений справа. */
export default async function TxPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission("cash");
  const { db } = ctx;
  const x = await db.cashTransaction.findUnique({
    where: { id },
    include: { cashbox: true, user: true, order: { select: { id: true, number: true } }, sale: { select: { id: true, number: true } } },
  });
  if (!x) notFound();
  const [logs, staff, categories, supplier, doc] = await Promise.all([
    db.cashTxLog.findMany({ where: { txId: id }, orderBy: { createdAt: "asc" } }),
    db.user.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    cashCategories({ db, companyId: ctx.company.id }),
    x.supplierId ? db.supplier.findUnique({ where: { id: x.supplierId } }) : null,
    x.stockDocId ? db.stockDoc.findUnique({ where: { id: x.stockDocId }, select: { id: true, number: true } }) : null,
  ]);
  const logUsers = new Map((await db.user.findMany({ where: { id: { in: logs.map((l) => l.userId).filter((u): u is string => !!u) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const amount = x.deletedAt ? (x.origAmount ?? 0) : x.amount;
  const editable = isEditableTx(x) && can(ctx.user, "cashOps");
  const back = `/cash/operations${Object.keys(sp).length ? `?${new URLSearchParams(sp)}` : ""}`;
  const docLink = x.order ? { href: `/orders/${x.order.id}`, label: `Заказ A${x.order.number}` } : x.sale ? { href: `/sales/${x.sale.id}`, label: `Чек B${x.sale.number}` } : doc ? { href: `/stock/docs/${doc.id}`, label: `Поступление №${doc.number}` } : null;
  const shownLogs = logs.length ? logs : [{ id: "c", action: "CREATE", userId: x.userId, amount, date: x.createdAt, createdAt: x.createdAt, note: null }];

  return (
    <>
      <PageHeader title={amount < 0 ? "Списание" : "Поступление денег"} back={back}>
        {docLink && (
          <Link href={docLink.href} className={btn("secondary")}>
            {docLink.label}
          </Link>
        )}
      </PageHeader>
      {x.deletedAt && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Операция удалена {x.deletedAt.toLocaleString("ru-RU")}. Сумма не учитывается в остатке кассы.</p>}
      {!isEditableTx(x) && !x.deletedAt && (
        <p className="mb-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">Эта операция создана документом ({docLink?.label ?? "перевод между кассами"}). Меняется через сам документ.</p>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <Form action={editTxAction} resetOnOk={false} className="space-y-3">
            <input type="hidden" name="id" value={x.id} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-slate-500">
                Касса: <b className="text-slate-800">{x.cashbox.name}</b>
              </div>
              <Select name="method" defaultValue={x.method} disabled={!editable} className="w-40">
                <option value="CASH">Наличными</option>
                <option value="CARD">Картой</option>
                <option value="TRANSFER">Безналом</option>
              </Select>
            </div>
            <Field label="Статья">
              <Input name="category" defaultValue={x.category} list="cash-categories" disabled={!editable} required />
              <datalist id="cash-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Дата выдачи" hint="Когда деньги ушли из кассы или пришли в неё">
                <Input type="date" name="issueDate" defaultValue={ymd(x.createdAt)} disabled={!editable} />
              </Field>
              <Field label="Дата события" hint="За какой день операция: например, зарплата за октябрь">
                <Input type="date" name="eventDate" defaultValue={ymd(x.eventDate)} disabled={!editable} />
              </Field>
            </div>
            <Field label="Ответственный">
              <Input value={x.user?.name ?? "—"} disabled readOnly />
            </Field>
            <Field label="Получатель">
              {supplier ? (
                <Link href={`/stock/suppliers/${supplier.id}`} className="block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-blue-600">
                  {supplier.name}
                </Link>
              ) : (
                <Select name="recipientId" defaultValue={x.recipientId ?? ""} disabled={!editable}>
                  <option value="">—</option>
                  {staff.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Примечание">
              <Textarea name="comment" defaultValue={x.comment ?? ""} rows={3} disabled={!editable} />
            </Field>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-600">Сумма, ₽</span>
              <Input
                name="amount"
                inputMode="decimal"
                defaultValue={String(Math.abs(amount) / 100)}
                disabled={!editable}
                className={`w-48 text-right text-lg font-semibold ${amount < 0 ? "text-red-600" : "text-emerald-600"}`}
              />
            </div>
            {editable && (
              <div className="flex gap-2 pt-2">
                <Submit>Сохранить</Submit>
                <Link href={back} className={btn("secondary")}>
                  Закрыть
                </Link>
              </div>
            )}
          </Form>
          {editable && (
            <Form action={deleteTxAction} className="mt-4 border-t border-slate-100 pt-3">
              <input type="hidden" name="id" value={x.id} />
              <button className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline">
                <Trash2 size={14} /> Удалить операцию
              </button>
            </Form>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 text-center font-semibold text-slate-800">История транзакции</div>
          <div className="space-y-3">
            {shownLogs.map((l) => {
              const a = ACT[l.action] ?? ACT.EDIT;
              return (
                <div key={l.id}>
                  <div className="mb-1 text-center text-xs text-slate-400">{l.createdAt.toLocaleDateString("ru-RU")}</div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-md text-white ${a.color}`}>{a.icon}</span>
                      <div className="flex-1 text-sm">
                        <div className="font-medium">{a.label}</div>
                        <div className="text-xs text-slate-500">{l.userId ? logUsers.get(l.userId) ?? x.user?.name : "—"}</div>
                      </div>
                      <span className="text-xs text-slate-400">{l.createdAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Сумма:</span>
                        <b>{rub(l.amount)}</b>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Дата:</span>
                        <span>{l.date.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}</span>
                      </div>
                      {l.note && <div className="text-xs text-slate-500">{l.note}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
