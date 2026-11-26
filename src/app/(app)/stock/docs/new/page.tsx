import { requireLocation, requirePermission } from "@/lib/auth";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { DocCart } from "@/components/doc-cart";
import { DOC_LABEL } from "@/lib/domain/stock";
import { stockDocAction } from "../../actions";

const HINT = {
  RECEIPT: "Товар приходит на склад точки, средняя закупочная цена пересчитывается.",
  TRANSFER: "Товар уходит со склада этой точки и приходит на выбранную.",
  WRITEOFF: "Брак, бой, использовано на нужды мастерской. Товар уходит со склада.",
  INVENTORY: "Впишите фактическое количество. Разница с учётом будет исправлена.",
} as const;

export default async function NewDocPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type: t } = await searchParams;
  const type = (t && t in DOC_LABEL ? t : "RECEIPT") as keyof typeof DOC_LABEL;
  const ctx = await requirePermission("stock");
  const loc = requireLocation(ctx);
  const [products, suppliers, allLocations] = await Promise.all([
    ctx.db.product.findMany({ where: { isActive: true }, include: { stocks: { where: { locationId: loc.id } } }, orderBy: { name: "asc" } }),
    ctx.db.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    ctx.db.location.findMany({ where: { isActive: true, id: { not: loc.id } }, orderBy: { name: "asc" } }),
  ]);
  const list = products
    .map((p) => ({ id: p.id, name: p.name, sku: p.sku, barcode: p.barcode, qty: p.stocks[0]?.qty ?? 0, cost: p.cost }))
    .filter((p) => type === "RECEIPT" || type === "INVENTORY" || p.qty > 0);

  return (
    <>
      <PageHeader title={`${DOC_LABEL[type]} · ${loc.name}`} back="/stock/docs" />
      <Form action={stockDocAction} resetOnOk={false}>
        <input type="hidden" name="type" value={type} />
        <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <Card>
            <p className="mb-3 text-sm text-slate-500">{HINT[type]}</p>
            <DocCart products={list} mode={type} />
          </Card>
          <Card title="Документ">
            <div className="space-y-3">
              {type === "RECEIPT" && (
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
                  <Select name="toLocationId" required defaultValue="">
                    <option value="" disabled>
                      {allLocations.length ? "Выберите точку" : "Других точек нет"}
                    </option>
                    {allLocations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
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
