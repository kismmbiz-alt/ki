import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { Card, dt, Field, Input, PageHeader, Select, Stat, Table } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { rub } from "@/lib/money";
import { cashBalance, EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAY_LABEL } from "@/lib/domain/cash";
import { cashAction } from "./actions";

export default async function CashPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { day } = await searchParams;
  const ctx = await requirePermission("cash");
  const { db, location } = ctx;
  const from = day ? new Date(day + "T00:00:00") : new Date(new Date().toDateString());
  const to = new Date(from.getTime() + 864e5);
  const [balance, list] = await Promise.all([
    location ? cashBalance({ db, companyId: ctx.company.id }, location.id) : { CASH: 0, CARD: 0, TRANSFER: 0 },
    db.cashTransaction.findMany({
      where: { locationId: location?.id, createdAt: { gte: from, lt: to } },
      include: { user: true, order: { select: { id: true, number: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const income = list.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = list.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const iso = from.toLocaleDateString("sv-SE");

  return (
    <>
      <PageHeader title={`Касса · ${location?.name ?? ""}`}>
        <form className="flex gap-2">
          <Input type="date" name="day" defaultValue={iso} className="w-40" />
          <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">Показать</button>
        </form>
      </PageHeader>
      <div className="mb-4 grid gap-3 sm:grid-cols-5">
        <Stat label="Наличные в кассе" value={rub(balance.CASH)} />
        <Stat label="Карта (всего)" value={rub(balance.CARD)} />
        <Stat label="Переводы (всего)" value={rub(balance.TRANSFER)} />
        <Stat label={`Приход за ${from.toLocaleDateString("ru-RU")}`} value={rub(income)} />
        <Stat label="Расход за день" value={rub(expense)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Table head={["Время", "Статья", "Способ", "Сумма", "Кто", "Комментарий"]} empty="Операций за день нет">
            {list.map((t) => (
              <tr key={t.id}>
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">{dt(t.createdAt)}</td>
                <td className="px-3 py-2">
                  {t.order ? (
                    <Link href={`/orders/${t.order.id}`} className="text-blue-600 hover:underline">
                      {t.category}
                    </Link>
                  ) : (
                    t.category
                  )}
                </td>
                <td className="px-3 py-2 text-slate-500">{PAY_LABEL[t.method]}</td>
                <td className={`whitespace-nowrap px-3 py-2 font-medium ${t.amount < 0 ? "text-red-600" : "text-green-700"}`}>{rub(t.amount)}</td>
                <td className="px-3 py-2 text-slate-500">{t.user?.name}</td>
                <td className="px-3 py-2 text-slate-500">{t.comment}</td>
              </tr>
            ))}
          </Table>
        </div>
        <Card title="Приход или расход">
          <Form action={cashAction} className="space-y-3">
            <Field label="Тип">
              <Select name="type" defaultValue="expense">
                <option value="expense">Расход</option>
                <option value="income">Приход</option>
              </Select>
            </Field>
            <Field label="Статья">
              <Input name="category" list="cash-cats" required />
              <datalist id="cash-cats">
                {[...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Сумма, ₽">
                <Input name="amount" required inputMode="decimal" />
              </Field>
              <Field label="Способ">
                <Select name="method" defaultValue="CASH">
                  <option value="CASH">Наличные</option>
                  <option value="CARD">Карта</option>
                  <option value="TRANSFER">Перевод</option>
                </Select>
              </Field>
            </div>
            <Field label="Комментарий">
              <Input name="comment" />
            </Field>
            <Submit>Записать</Submit>
          </Form>
        </Card>
      </div>
    </>
  );
}
