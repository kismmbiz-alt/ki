import { requireLocation, requirePermission } from "@/lib/auth";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { DocCart } from "@/components/doc-cart";
import { DOC_LABEL } from "@/lib/domain/stock";
import { defaultWarehouseId } from "@/lib/domain/places";
import { stockDocAction } from "../../actions";
import { WarehousePills } from "../../_ui/wh-pills";

const HINT = {
  RECEIPT: "Товар приходит на выбранный склад, средняя закупочная цена пересчитывается.",
  TRANSFER: "Товар уходит с выбранного склада и приходит на другой склад этой или другой точки.",
  SUPPLIER_RETURN: "Товар возвращается поставщику и уходит со склада.",
  WRITEOFF: "Брак, бой, использовано на нужды мастерской. Товар уходит со склада.",
  INVENTORY: "Впишите фактическое количество. Разница с учётом будет исправлена.",
} as const;

const BACK = { RECEIPT: "receipts", TRANSFER: "transfers", WRITEOFF: "writeoffs", INVENTORY: "inventory", SUPPLIER_RETURN: "returns" } as const;

export default async function NewDocPage({ searchParams }: { searchParams: Promise<{ type?: string; w?: string }> }) {
  const { type: t, w } = await searchParams;
  const type = (t && t in DOC_LABEL ? t : "RECEIPT") as keyof typeof DOC_LABEL;
  const ctx = await requirePermission("stockDocs");
  const loc = requireLocation(ctx);
  const warehouses = await ctx.db.warehouse.findMany({ where: { isActive: true, locationId: loc.id }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
  if (!warehouses.length) warehouses.push(await ctx.db.warehouse.findUniqueOrThrow({ where: { id: await defaultWarehouseId(ctx.db, loc.id) } }));
  const wh = warehouses.find((x) => x.id === w) ?? warehouses[0];
  const [products, suppliers, targets] = await Promise.all([
    ctx.db.product.findMany({ where: { isActive: true }, include: { stocks: { where: { warehouseId: wh.id } } }, orderBy: { name: "asc" } }),
    ctx.db.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    ctx.db.warehouse.findMany({ where: { isActive: true, id: { not: wh.id }, location: { isActive: true } }, include: { location: true }, orderBy: [{ location: { createdAt: "asc" } }, { sort: "asc" }] }),
  ]);
  const list = products
    .map((p) => ({ id: p.id, name: p.name, sku: p.sku, barcode: p.barcode, qty: p.stocks[0]?.qty ?? 0, cost: p.cost }))
    .filter((p) => type === "RECEIPT" || type === "INVENTORY" || p.qty > 0);

  return (
    <>
      <PageHeader title={`${DOC_LABEL[type]} · ${loc.name}`} back={`/stock/${BACK[type]}`} />
      {warehouses.length > 1 && (
        <WarehousePills warehouses={warehouses} current={wh.id} href={(id) => `/stock/docs/new?type=${type}&w=${id}`} />
      )}
      <Form action={stockDocAction} resetOnOk={false}>
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="warehouseId" value={wh.id} />
        <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <Card>
            <p className="mb-3 text-sm text-slate-500">{HINT[type]}</p>
            <DocCart products={list} mode={type} />
          </Card>
          <Card title="Документ">
            <div className="space-y-3">
              <div className="text-sm text-slate-600">
                {type === "TRANSFER" ? "Откуда" : "Склад"}: <b>{wh.name}</b>
              </div>
              {(type === "RECEIPT" || type === "SUPPLIER_RETURN") && (
                <Field label="Поставщик">
                  <Select name="supplierId" defaultValue="">
                    <option value="">—</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {type === "TRANSFER" && (
                <Field label="Куда переместить *">
                  <Select name="toWarehouseId" required defaultValue="">
                    <option value="" disabled>
                      {targets.length ? "Выберите склад" : "Других складов нет"}
                    </option>
                    {targets.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                        {x.locationId !== loc.id ? ` · ${x.location.name}` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label={type === "WRITEOFF" ? "Причина" : "Комментарий"}>
                <Input name="comment" placeholder={type === "RECEIPT" ? "№ накладной" : ""} />
              </Field>
              <Submit className="w-full">Провести</Submit>
            </div>
          </Card>
        </div>
      </Form>
    </>
  );
}
