import { requirePermission } from "@/lib/auth";
import { Card, Input, PageHeader } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { kopToInput } from "@/lib/money";
import { SettingsTabs } from "../tabs";
import { saveServiceAction, saveSourceAction } from "../actions";

export default async function CatalogPage() {
  const { db } = await requirePermission("settings");
  const [services, sources] = await Promise.all([
    db.service.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    db.adSource.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
  ]);
  return (
    <>
      <PageHeader title="Настройки" />
      <SettingsTabs admin />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Прайс работ">
          <div className="space-y-2">
            {services.map((s) => (
              <Form key={s.id} action={saveServiceAction} className="flex items-center gap-2" resetOnOk={false}>
                <input type="hidden" name="id" value={s.id} />
                <Input name="name" defaultValue={s.name} />
                <Input name="price" defaultValue={kopToInput(s.price)} className="w-28" />
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" name="isActive" value="1" defaultChecked={s.isActive} /> акт.
                </label>
                <Submit variant="secondary">OK</Submit>
              </Form>
            ))}
            <Form action={saveServiceAction} className="flex items-center gap-2 border-t border-slate-100 pt-3">
              <Input name="name" placeholder="Замена дисплея" required />
              <Input name="price" placeholder="Цена, ₽" className="w-28" required />
              <Submit>Добавить</Submit>
            </Form>
          </div>
        </Card>
        <Card title="Откуда приходят клиенты">
          <div className="space-y-2">
            {sources.map((s) => (
              <Form key={s.id} action={saveSourceAction} className="flex items-center gap-2" resetOnOk={false}>
                <input type="hidden" name="id" value={s.id} />
                <Input name="name" defaultValue={s.name} />
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" name="isActive" value="1" defaultChecked={s.isActive} /> акт.
                </label>
                <Submit variant="secondary">OK</Submit>
              </Form>
            ))}
            <Form action={saveSourceAction} className="flex items-center gap-2 border-t border-slate-100 pt-3">
              <Input name="name" placeholder="ВКонтакте" required />
              <Submit>Добавить</Submit>
            </Form>
          </div>
        </Card>
      </div>
    </>
  );
}
