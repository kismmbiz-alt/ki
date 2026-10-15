import { requirePermission } from "@/lib/auth";
import { Card, dt, PageHeader, Select, Table } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { SaleCart } from "@/components/sale-cart";
import { rub } from "@/lib/money";
import { createSaleAction } from "./actions";

export default async function SalesPage() {
  const { db, location } = await requirePermission("sales");
  const [sales, stock] = await Promise.all([
    db.sale.findMany({
      where: location ? { locationId: location.id } : {},
      include: { items: true, user: true, transactions: { select: { method: true } } },
      orderBy: { number: "desc" },
      take: 100,
    }),
    db.stock.findMany({ where: { locationId: location?.id, qty: { gt: 0 }, product: { isActive: true } }, include: { product: true } }),
  ]);
  const products = stock
    .map((s) => ({ id: s.product.id, name: s.product.name, price: s.product.price, qty: s.qty, barcode: s.product.barcode }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader title={`Продажи · ${location?.name ?? ""}`} />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="Новая продажа" className="lg:col-span-2">
          <Form action={createSaleAction} className="space-y-3" resetOnOk={false}>
            <SaleCart products={products} />
            <div className="flex gap-2">
              <Select name="method" defaultValue="CASH">
                <option value="CASH">Наличные</option>
                <option value="CARD">Карта</option>
                <option value="TRANSFER">Перевод</option>
              </Select>
              <Submit>Провести продажу</Submit>
            </div>
          </Form>
        </Card>
        <div className="lg:col-span-3">
          <Table head={["№", "Дата", "Товары", "Сумма", "Продавец"]} empty="Продаж пока нет">
            {sales.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2">{s.number}</td>
                <td className="px-3 py-2 text-slate-500">{dt(s.createdAt)}</td>
                <td className="px-3 py-2">{s.items.map((i) => `${i.name} × ${i.qty}`).join(", ")}</td>
                <td className="px-3 py-2 font-medium">{rub(s.total)}</td>
                <td className="px-3 py-2 text-slate-500">{s.user?.name}</td>
              </tr>
            ))}
          </Table>
        </div>
      </div>
    </>
  );
}
