import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { Card, dt, Field, Input, PageHeader, Table } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { kopToInput, rub } from "@/lib/money";
import { inventoryAction, receiveAction, updateProductAction } from "../actions";

const MOVE_LABEL = { RECEIPT: "Приход", ORDER: "В заказ", SALE: "Продажа", ADJUST: "Инвентаризация", RETURN: "Возврат" } as const;

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, location } = await requirePermission("stock");
  const p = await db.product.findUnique({
    where: { id },
    include: { stocks: { include: { location: true } }, moves: { orderBy: { createdAt: "desc" }, take: 100, include: { location: true, user: true } } },
  });
  if (!p) notFound();
  const here = p.stocks.find((s) => s.locationId === location?.id)?.qty ?? 0;

  return (
    <>
      <PageHeader title={p.name} back="/stock" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Остатки по точкам">
            <ul className="text-sm">
              {p.stocks.map((s) => (
                <li key={s.id} className="flex justify-between py-1">
                  <span>{s.location.name}</span>
                  <b>{s.qty} шт</b>
                </li>
              ))}
              {!p.stocks.length && <li className="text-slate-400">Нет на складе</li>}
            </ul>
          </Card>
          <Table head={["Дата", "Операция", "Точка", "Кол-во", "Кто", "Комментарий"]} empty="Движений нет">
            {p.moves.map((m) => (
              <tr key={m.id}>
                <td className="px-3 py-2 text-slate-500">{dt(m.createdAt)}</td>
                <td className="px-3 py-2">{MOVE_LABEL[m.type]}</td>
                <td className="px-3 py-2">{m.location.name}</td>
                <td className={`px-3 py-2 font-medium ${m.qty < 0 ? "text-red-600" : "text-green-700"}`}>{m.qty > 0 ? `+${m.qty}` : m.qty}</td>
                <td className="px-3 py-2 text-slate-500">{m.user?.name}</td>
                <td className="px-3 py-2 text-slate-500">{m.comment}</td>
              </tr>
            ))}
          </Table>
        </div>
        <div className="space-y-4">
          <Card title={`Приход на «${location?.name}»`}>
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
              <Submit>Оприходовать</Submit>
            </Form>
          </Card>
          <Card title="Инвентаризация">
            <Form action={inventoryAction} className="flex items-end gap-2">
              <input type="hidden" name="productId" value={p.id} />
              <Field label={`Факт на точке (сейчас ${here})`} className="flex-1">
                <Input name="qty" required inputMode="numeric" />
              </Field>
              <Submit variant="secondary">Исправить</Submit>
            </Form>
          </Card>
          <Card title="Карточка">
            <Form action={updateProductAction} className="space-y-2" resetOnOk={false}>
              <input type="hidden" name="id" value={p.id} />
              <Field label="Название">
                <Input name="name" defaultValue={p.name} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Артикул">
                  <Input name="sku" defaultValue={p.sku ?? ""} />
                </Field>
                <Field label="Штрихкод">
                  <Input name="barcode" defaultValue={p.barcode ?? ""} />
                </Field>
                <Field label="Цена, ₽">
                  <Input name="price" defaultValue={kopToInput(p.price)} />
                </Field>
                <Field label="Мин. остаток">
                  <Input name="minQty" defaultValue={String(p.minQty)} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isActive" value="1" defaultChecked={p.isActive} /> в продаже
              </label>
              <div className="text-xs text-slate-500">Средняя закупочная цена: {rub(p.cost)}</div>
              <Submit variant="secondary">Сохранить</Submit>
            </Form>
          </Card>
        </div>
      </div>
    </>
  );
}
