import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { can, requirePermission } from "@/lib/auth";
import { btn, Card, Field, Input, PageHeader, Table } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { rub } from "@/lib/money";
import { createProductAction } from "./actions";

export default async function StockPage({ searchParams }: { searchParams: Promise<{ q?: string; low?: string }> }) {
  const { q, low } = await searchParams;
  const { db, location, user } = await requirePermission("stock");
  const where: Prisma.ProductWhereInput = { isActive: true };
  if (q?.trim()) where.OR = [{ name: { contains: q.trim(), mode: "insensitive" } }, { sku: { contains: q.trim() } }, { barcode: q.trim() }];
  const products = await db.product.findMany({
    where,
    include: { stocks: true },
    orderBy: { name: "asc" },
    take: 500,
  });
  const rows = products
    .map((p) => {
      const here = p.stocks.find((s) => s.locationId === location?.id)?.qty ?? 0;
      const all = p.stocks.reduce((s, x) => s + x.qty, 0);
      return { p, here, all, lowStock: here <= p.minQty && p.minQty > 0 };
    })
    .filter((r) => !low || r.lowStock);
  const showCost = can(user.role, "reports");
  const value = rows.reduce((s, r) => s + r.here * r.p.cost, 0);

  return (
    <>
      <PageHeader title={`Склад · ${location?.name ?? ""}`}>
        <form className="flex gap-2">
          <Input name="q" defaultValue={q} placeholder="Название, артикул, штрихкод" className="w-64" autoFocus />
          <button className={btn("secondary")}>Найти</button>
        </form>
        <Link href={low ? "/stock" : "/stock?low=1"} className={btn("secondary")}>
          {low ? "Все товары" : "Заканчиваются"}
        </Link>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Table head={["Товар", "Артикул", "Цена", ...(showCost ? ["Закупка"] : []), "Здесь", "Всего"]} empty="Товаров нет">
            {rows.map(({ p, here, all, lowStock }) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Link href={`/stock/${p.id}`} className="text-blue-600 hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-500">{p.sku}</td>
                <td className="px-3 py-2">{rub(p.price)}</td>
                {showCost && <td className="px-3 py-2 text-slate-500">{rub(p.cost)}</td>}
                <td className={`px-3 py-2 font-medium ${lowStock ? "text-red-600" : ""}`}>{here}</td>
                <td className="px-3 py-2 text-slate-500">{all}</td>
              </tr>
            ))}
          </Table>
          {showCost && <p className="mt-2 text-sm text-slate-500">Товара на точке по закупке: {rub(value)}</p>}
        </div>
        <Card title="Новый товар или запчасть">
          <Form action={createProductAction} className="space-y-3">
            <Field label="Название *">
              <Input name="name" required placeholder="Дисплей iPhone 11 (оригинал)" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Артикул">
                <Input name="sku" />
              </Field>
              <Field label="Штрихкод">
                <Input name="barcode" />
              </Field>
              <Field label="Цена продажи, ₽">
                <Input name="price" inputMode="decimal" required />
              </Field>
              <Field label="Мин. остаток">
                <Input name="minQty" inputMode="numeric" />
              </Field>
              <Field label="Приход, шт">
                <Input name="qty" inputMode="numeric" />
              </Field>
              <Field label="Закупка за шт, ₽">
                <Input name="cost" inputMode="decimal" />
              </Field>
            </div>
            <Submit>Добавить</Submit>
          </Form>
        </Card>
      </div>
    </>
  );
}
