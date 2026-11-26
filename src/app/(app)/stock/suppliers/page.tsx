import { requirePermission } from "@/lib/auth";
import { Card, Input, PageHeader } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { saveSupplierAction } from "../actions";
import { StockTabs } from "../_ui/tabs";

export default async function SuppliersPage() {
  const { db } = await requirePermission("stock");
  const suppliers = await db.supplier.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }], include: { _count: { select: { products: true, docs: true } } } });
  return (
    <>
      <PageHeader title="Склад" />
      <StockTabs />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card title="Поставщики">
          <div className="space-y-2">
            {suppliers.map((s) => (
              <Form key={s.id} action={saveSupplierAction} resetOnOk={false} className="grid items-center gap-2 sm:grid-cols-[1fr_180px_1fr_auto_auto]">
                <input type="hidden" name="id" value={s.id} />
                <Input name="name" defaultValue={s.name} />
                <Input name="phone" defaultValue={s.phone ?? ""} placeholder="Телефон" />
                <Input name="notes" defaultValue={s.notes ?? ""} placeholder="Заметки: сайт, условия" />
                <label className="flex items-center gap-1 text-xs text-slate-500" title={`Товаров: ${s._count.products}, документов: ${s._count.docs}`}>
                  <input type="checkbox" name="isActive" value="1" defaultChecked={s.isActive} /> активен
                </label>
                <Submit variant="secondary">OK</Submit>
              </Form>
            ))}
            {!suppliers.length && <p className="text-sm text-slate-400">Поставщиков пока нет</p>}
          </div>
        </Card>
        <Card title="Новый поставщик">
          <Form action={saveSupplierAction} className="space-y-2">
            <Input name="name" placeholder="Название *" required />
            <Input name="phone" placeholder="Телефон" />
            <Input name="notes" placeholder="Заметки" />
            <Submit>Добавить</Submit>
          </Form>
        </Card>
      </div>
    </>
  );
}
