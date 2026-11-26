import { notFound } from "next/navigation";
import { can, requirePermission } from "@/lib/auth";
import { Card, dt, Field, Input, PageHeader, Table } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { kopToInput, rub } from "@/lib/money";
import { inventoryAction, receiveAction, updateProductAction } from "../actions";
import { ProductFields } from "../_ui/product-fields";

const MOVE_LABEL: Record<string, string> = {
  RECEIPT: "Приход",
  ORDER: "В заказ",
  SALE: "Продажа",
  ADJUST: "Инвентаризация",
  RETURN: "Возврат",
  TRANSFER: "Перемещение",
  WRITEOFF: "Списание",
};

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, location, user } = await requirePermission("stock");
  const [p, groups, suppliers] = await Promise.all([
    db.product.findUnique({
      where: { id },
      include: { stocks: { include: { location: true } }, moves: { orderBy: { createdAt: "desc" }, take: 100, include: { location: true, user: true } } },
    }),
    db.productGroup.findMany({ orderBy: { name: "asc" } }),
    db.supplier.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!p) notFound();
  const here = p.stocks.find((s) => s.locationId === location?.id)?.qty ?? 0;
  const showCost = can(user.role, "reports");

  return (
    <>
      <PageHeader title={p.name} back="/stock">
        {!p.isActive && <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500">в архиве</span>}
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Mini label={`На «${location?.name ?? ""}»`} value={`${here} шт`} />
            <Mini label="Всего по точкам" value={`${p.stocks.reduce((s, x) => s + x.qty, 0)} шт`} />
            <Mini label="Розничная" value={rub(p.price)} />
            {showCost ? <Mini label="Закупочная (средняя)" value={rub(p.cost)} /> : <Mini label="Ремонтная" value={p.repairPrice != null ? rub(p.repairPrice) : "—"} />}
          </div>
          {p.stocks.length > 1 && (
            <Card title="Остатки по точкам">
              <ul className="text-sm">
                {p.stocks.map((s) => (
                  <li key={s.id} className="flex justify-between py-1">
                    <span>{s.location.name}</span>
                    <b>{s.qty} шт</b>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Table head={["Дата", "Операция", "Точка", "Кол-во", "Кто", "Комментарий"]} empty="Движений нет">
            {p.moves.map((m) => (
              <tr key={m.id}>
                <td className="px-3 py-2 whitespace-nowrap text-slate-500">{dt(m.createdAt)}</td>
                <td className="px-3 py-2">{MOVE_LABEL[m.type] ?? m.type}</td>
                <td className="px-3 py-2">{m.location.name}</td>
                <td className={`px-3 py-2 font-medium ${m.qty < 0 ? "text-red-600" : "text-green-600"}`}>{m.qty > 0 ? `+${m.qty}` : m.qty}</td>
                <td className="px-3 py-2 text-slate-500">{m.user?.name}</td>
                <td className="px-3 py-2 text-slate-500">{m.comment}</td>
              </tr>
            ))}
          </Table>
        </div>
        <div className="space-y-4">
          <Card title="Карточка товара">
            <Form action={updateProductAction} className="space-y-3" resetOnOk={false}>
              <input type="hidden" name="id" value={p.id} />
              <ProductFields p={p} groups={groups} suppliers={suppliers} />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="isActive" value="1" defaultChecked={p.isActive} /> в продаже (снимите, чтобы убрать в архив)
              </label>
              <Submit>Сохранить</Submit>
            </Form>
          </Card>
          <Card title={`Быстрый приход на «${location?.name ?? ""}»`}>
            <Form action={receiveAction} className="space-y-2">
              <input type="hidden" name="productId" value={p.id} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Кол-во">
                  <Input name="qty" required inputMode="numeric" />
                </Field>
                <Field label="Закупка за шт, ₽">
                  <Input name="cost" inputMode="decimal" defaultValue={kopToInput(p.cost)} />
                </Field>
              </div>
              <Input name="comment" placeholder="Поставщик, накладная" />
              <Submit variant="secondary">Оприходовать</Submit>
            </Form>
          </Card>
          <Card title="Инвентаризация">
            <Form action={inventoryAction} className="flex items-end gap-2">
              <input type="hidden" name="productId" value={p.id} />
              <Field label={`Факт на точке (по учёту ${here})`} className="flex-1">
                <Input name="qty" required inputMode="numeric" />
              </Field>
              <Submit variant="secondary">Исправить</Submit>
            </Form>
          </Card>
        </div>
      </div>
    </>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}
