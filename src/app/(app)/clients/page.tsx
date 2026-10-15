import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { btn, Card, dOnly, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { normalizePhone } from "@/lib/domain/orders";
import { saveClientAction } from "./actions";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { db } = await requireUser();
  const where: Prisma.ClientWhereInput = {};
  if (q?.trim()) {
    const phone = normalizePhone(q);
    where.OR = [{ name: { contains: q.trim(), mode: "insensitive" } }, ...(phone.length > 4 ? [{ phone: { contains: phone.slice(-7) } }] : [])];
  }
  const [clients, sources] = await Promise.all([
    db.client.findMany({ where, include: { adSource: true, _count: { select: { orders: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.adSource.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Клиенты">
        <form className="flex gap-2">
          <Input name="q" defaultValue={q} placeholder="Имя или телефон" className="w-64" />
          <button className={btn("secondary")}>Найти</button>
        </form>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Table head={["Имя", "Телефон", "Источник", "Заказов", "С нами с"]} empty="Клиентов не найдено">
            {clients.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Link href={`/clients/${c.id}`} className="text-blue-600 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-3 py-2">{c.phone}</td>
                <td className="px-3 py-2 text-slate-500">{c.adSource?.name ?? "—"}</td>
                <td className="px-3 py-2">{c._count.orders}</td>
                <td className="px-3 py-2 text-slate-500">{dOnly(c.createdAt)}</td>
              </tr>
            ))}
          </Table>
        </div>
        <Card title="Новый клиент">
          <Form action={saveClientAction} className="space-y-3" resetOnOk={false}>
            <Field label="Имя">
              <Input name="name" />
            </Field>
            <Field label="Телефон *">
              <Input name="phone" required type="tel" />
            </Field>
            <Field label="Откуда узнал">
              <Select name="adSourceId" defaultValue="">
                <option value="">—</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Submit>Добавить</Submit>
          </Form>
        </Card>
      </div>
    </>
  );
}
