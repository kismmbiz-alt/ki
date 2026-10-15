import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { btn, Badge, Card, dt, Field, Input, PageHeader, Select, Table, Textarea } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { rub } from "@/lib/money";
import { totals } from "@/lib/domain/orders";
import { saveClientAction } from "../actions";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, user } = await requireUser();
  const c = await db.client.findUnique({
    where: { id },
    include: {
      orders: {
        where: can(user.role, "allOrders") ? {} : { masterId: user.id },
        include: { status: true, items: true, payments: { select: { amount: true } } },
        orderBy: { number: "desc" },
      },
    },
  });
  if (!c) notFound();
  const sources = await db.adSource.findMany({ orderBy: { name: "asc" } });
  const spent = c.orders.reduce((s, o) => s + o.payments.reduce((a, p) => a + p.amount, 0), 0);

  return (
    <>
      <PageHeader title={c.name} back="/clients">
        <Link href={`/orders/new?clientId=${c.id}`} className={btn()}>
          + Заказ для клиента
        </Link>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Table head={["№", "Дата", "Устройство", "Статус", "Сумма"]} empty="Заказов нет">
            {c.orders.map((o) => (
              <tr key={o.id}>
                <td className="px-3 py-2">
                  <Link href={`/orders/${o.id}`} className="text-blue-600 hover:underline">
                    {o.number}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-500">{dt(o.createdAt)}</td>
                <td className="px-3 py-2">{[o.deviceType, o.brand, o.model].filter(Boolean).join(" ")}</td>
                <td className="px-3 py-2">
                  <Badge color={o.status.color}>{o.status.name}</Badge>
                </td>
                <td className="px-3 py-2">{rub(totals(o.items, 0).total)}</td>
              </tr>
            ))}
          </Table>
          <p className="mt-2 text-sm text-slate-500">Всего оплачено клиентом: {rub(spent)}</p>
        </div>
        <Card title="Данные клиента">
          <Form action={saveClientAction} className="space-y-3" resetOnOk={false}>
            <input type="hidden" name="id" value={c.id} />
            <Field label="Имя">
              <Input name="name" defaultValue={c.name} />
            </Field>
            <Field label="Телефон">
              <Input name="phone" defaultValue={c.phone} />
            </Field>
            <Field label="Email">
              <Input name="email" defaultValue={c.email ?? ""} />
            </Field>
            <Field label="Откуда узнал">
              <Select name="adSourceId" defaultValue={c.adSourceId ?? ""}>
                <option value="">—</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Заметки">
              <Textarea name="notes" defaultValue={c.notes ?? ""} />
            </Field>
            <Submit variant="secondary">Сохранить</Submit>
          </Form>
        </Card>
      </div>
    </>
  );
}
