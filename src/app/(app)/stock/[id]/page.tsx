import { notFound } from "next/navigation";
import { can, requirePermission } from "@/lib/auth";
import { Card, dt, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { kopToInput, rub } from "@/lib/money";
import { inventoryAction, receiveAction, updateProductAction } from "../actions";
import { ProductFields } from "../_ui/product-fields";
import { ensurePriceTypes } from "@/lib/domain/prices";
import { barcodeSvg } from "@/lib/barcode";
import { templatesFor } from "@/lib/print/templates";

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
  const { db, location, user, company } = await requirePermission("stock");
  const [p, groups, suppliers, priceTypes, tags] = await Promise.all([
    db.product.findUnique({
      where: { id },
      include: {
        stocks: { include: { location: true, warehouse: true }, orderBy: { warehouse: { sort: "asc" } } },
        moves: { orderBy: { createdAt: "desc" }, take: 100, include: { location: true, warehouse: true, user: true } },
        prices: true,
      },
    }),
    db.productGroup.findMany({ orderBy: { name: "asc" } }),
    db.supplier.findMany({ orderBy: { name: "asc" } }),
    ensurePriceTypes(db, company.id),
    templatesFor(db, company.id, ["price_tag"]),
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
          <Card title="Цены и штрихкод">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <ul className="grid flex-1 grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                <li>Розничная: <b>{rub(p.price)}</b></li>
                <li>Ремонтная: <b>{p.repairPrice != null ? rub(p.repairPrice) : "—"}</b></li>
                <li>Минимальная: <b>{p.minPrice != null ? rub(p.minPrice) : "—"}</b></li>
                {showCost && <li>Закупочная: <b>{rub(p.cost)}</b></li>}
                {priceTypes.map((t) => {
                  const v = p.prices.find((x) => x.priceTypeId === t.id)?.value;
                  return (
                    <li key={t.id}>
                      {t.name}: <b>{v != null ? rub(v) : "—"}</b>
                    </li>
                  );
                })}
              </ul>
              {p.barcode && <div className="rounded bg-white p-2" dangerouslySetInnerHTML={{ __html: barcodeSvg(p.barcode, { width: 180, height: 40 }) }} />}
            </div>
            {tags.length > 0 && (
              <form action="/print/t" target="_blank" className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-sm">
                <input type="hidden" name="products" value={p.id} />
                <span className="text-slate-500">Ценник:</span>
                <select name="tpl" defaultValue={tags.find((t) => t.isDefault)?.id} className="rounded-lg border border-slate-200 px-2 py-1.5">
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <input name="qty" type="number" min={1} max={500} defaultValue={Math.max(1, here)} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5" title="Сколько штук" />
                <span className="text-slate-500">шт.</span>
                <button className="rounded-lg bg-[#4f6bff] px-3 py-1.5 font-medium on-accent">Печатать</button>
              </form>
            )}
          </Card>
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
              <ProductFields p={p} groups={groups} suppliers={suppliers} priceTypes={priceTypes} showCost={showCost} />
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
