import { notFound } from "next/navigation";
import { can, requirePermission } from "@/lib/auth";
import { Card, dt, Field, Input, PageHeader, Select, Table } from "@/components/ui";
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
      include: {
        stocks: { include: { location: true, warehouse: true }, orderBy: { warehouse: { sort: "asc" } } },
        moves: { orderBy: { createdAt: "desc" }, take: 100, include: { location: true, warehouse: true, user: true } },
      },
    }),
    db.productGroup.findMany({ orderBy: { name: "asc" } }),
    db.supplier.findMany({ orderBy: { name: "asc" } }),
  ]);
  const warehouses = await db.warehouse.findMany({ where: { isActive: true, locationId: location?.id }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
  if (!p) notFound();
  const here = p.stocks.filter((s) => s.locationId === location?.id).reduce((a, s) => a + s.qty, 0);
  const canEdit = can(user, "stockDocs");
  const whSelect = (
    <Select name="warehouseId" defaultValue={warehouses[0]?.id}>
      {warehouses.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name} (сейчас {p!.stocks.find((s) => s.warehouseId === w.id)?.qty ?? 0})
        </option>
      ))}
    </Select>
  );
  const showCost = can(user, "cost");

  return (
    <>
      <PageHeader title={p.name} back="/stock">
        {!p.isActive && <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500">в архиве</span>}
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Mini label={`На «${location?.name ?? ""}»`} value={`${here} шт`} />
            <Mini label="Всего по всем складам" value={`${p.stocks.reduce((s, x) => s + x.qty, 0)} шт`} />
            <Mini label="Розничная" value={rub(p.price)} />
            {showCost ? <Mini label="Закупочная (средняя)" value={rub(p.cost)} /> : <Mini label="Ремонтная" value={p.repairPrice != null ? rub(p.repairPrice) : "—"} />}
          </div>
          {p.stocks.length > 1 && (
            <Card title="Остатки по складам">
              <ul className="text-sm">
                {p.stocks.map((s) => (
                  <li key={s.id} className="flex justify-between py-1">
                    <span>
                      {s.warehouse.name} <span className="text-slate-400">· {s.location.name}</span>
                    </span>
                    <b>{s.qty} шт</b>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Table head={["Дата", "Операция", "Склад", "Кол-во", "Кто", "Комментарий"]} empty="Движений нет">
            {p.moves.map((m) => (
              <tr key={m.id}>
                <td className="px-3 py-2 whitespace-nowrap text-slate-500">{dt(m.createdAt)}</td>
                <td className="px-3 py-2">{MOVE_LABEL[m.type] ?? m.type}</td>
                <td className="px-3 py-2">{m.warehouse.name}</td>
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
          {canEdit && (
          <Card title="Быстрый приход">
            <Form action={receiveAction} className="space-y-2">
              <input type="hidden" name="productId" value={p.id} />
              {whSelect}
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
          )}
          {canEdit && (
          <Card title="Инвентаризация">
            <Form action={inventoryAction} className="space-y-2">
              <input type="hidden" name="productId" value={p.id} />
              {whSelect}
              <div className="flex items-end gap-2">
                <Field label="Фактический остаток на складе" className="flex-1">
                  <Input name="qty" required inputMode="numeric" />
                </Field>
                <Submit variant="secondary">Исправить</Submit>
              </div>
            </Form>
          </Card>
          )}
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
