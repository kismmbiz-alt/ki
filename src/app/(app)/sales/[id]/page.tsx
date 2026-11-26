import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { btn, Card, dt, Input, PageHeader, Select } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { rub } from "@/lib/money";
import { PAY_LABEL } from "@/lib/domain/cash";
import { returnSaleAction } from "../actions";

export default async function SalePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const { id } = await params;
  const { done } = await searchParams;
  const { db } = await requirePermission("sales");
  const s = await db.sale.findUnique({ where: { id }, include: { items: true, user: true, client: true, transactions: true, location: true } });
  if (!s) notFound();
  const [returns, original] = await Promise.all([
    db.sale.findMany({ where: { returnOfId: s.id }, include: { items: true }, orderBy: { createdAt: "asc" } }),
    s.returnOfId ? db.sale.findUnique({ where: { id: s.returnOfId } }) : null,
  ]);
  const returned = new Map<string, number>();
  for (const r of returns) for (const i of r.items) returned.set(i.productId, (returned.get(i.productId) ?? 0) + i.qty);
  const sum = s.items.reduce((a, i) => a + i.qty * i.price, 0);

  return (
    <>
      <PageHeader title={`${s.isReturn ? "Возврат" : "Продажа"} №${s.number}`} back="/sales/history">
        <a href={`/print/sale/${s.id}`} target="_blank" className={btn("secondary")}>
          <Printer size={16} /> Товарный чек
        </a>
        <Link href="/sales" className={btn()}>
          Новая продажа
        </Link>
      </PageHeader>
      {done && <div className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">Продажа проведена: {rub(s.total)}</div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="py-2 font-medium">Товар</th>
                <th className="py-2 text-right font-medium">Кол-во</th>
                <th className="py-2 text-right font-medium">Цена</th>
                <th className="py-2 text-right font-medium">Сумма</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {s.items.map((i) => (
                <tr key={i.id}>
                  <td className="py-2">{i.name}</td>
                  <td className="py-2 text-right">{i.qty}</td>
                  <td className="py-2 text-right">{rub(i.price)}</td>
                  <td className="py-2 text-right">{rub(i.qty * i.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 space-y-1 text-right text-sm">
            {s.discount > 0 && <div className="text-slate-500">Скидка: −{rub(s.discount)}</div>}
            <div className="text-lg font-semibold">Итого: {rub(s.isReturn ? s.total : sum - s.discount)}</div>
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Сведения">
            <dl className="space-y-1 text-sm text-slate-700">
              <div>Дата: {dt(s.createdAt)}</div>
              <div>Точка: {s.location.name}</div>
              <div>Продавец: {s.user?.name ?? "—"}</div>
              {s.client && (
                <div>
                  Клиент:{" "}
                  <Link href={`/clients/${s.client.id}`} className="text-blue-600 hover:underline">
                    {s.client.name}
                  </Link>
                </div>
              )}
              {s.transactions.map((t) => (
                <div key={t.id}>
                  {PAY_LABEL[t.method]}: {rub(t.amount)}
                </div>
              ))}
              {original && (
                <div>
                  Возврат по{" "}
                  <Link href={`/sales/${original.id}`} className="text-blue-600 hover:underline">
                    продаже №{original.number}
                  </Link>
                </div>
              )}
              {returns.map((r) => (
                <div key={r.id} className="text-red-600">
                  <Link href={`/sales/${r.id}`} className="hover:underline">
                    Возврат №{r.number}: {rub(r.total)}
                  </Link>
                </div>
              ))}
            </dl>
          </Card>
          {!s.isReturn && (
            <Card title="Возврат товара">
              <Form action={returnSaleAction} className="space-y-2">
                <input type="hidden" name="saleId" value={s.id} />
                {s.items.map((i) => {
                  const left = i.qty - (returned.get(i.productId) ?? 0);
                  return (
                    <label key={i.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-slate-700">
                        {i.name} <span className="text-slate-400">(можно {left})</span>
                      </span>
                      <Input name={`ret_${i.id}`} inputMode="numeric" defaultValue="0" className="w-16" disabled={left <= 0} />
                    </label>
                  );
                })}
                <Input name="reason" placeholder="Причина возврата" />
                <Select name="method" defaultValue={s.transactions[0]?.method ?? "CASH"}>
                  <option value="CASH">Вернуть наличными</option>
                  <option value="CARD">Вернуть на карту</option>
                  <option value="TRANSFER">Вернуть переводом</option>
                </Select>
                <Submit variant="danger">Оформить возврат</Submit>
              </Form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
