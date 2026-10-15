import { requirePermission } from "@/lib/auth";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { SettingsTabs } from "../tabs";
import { saveLocationAction } from "../actions";

export default async function LocationsPage() {
  const { db } = await requirePermission("settings");
  const locations = await db.location.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <>
      <PageHeader title="Настройки" />
      <SettingsTabs admin />
      <div className="grid gap-4 lg:grid-cols-2">
        {locations.map((l) => (
          <Card key={l.id} title={l.name}>
            <Form action={saveLocationAction} className="space-y-2" resetOnOk={false}>
              <input type="hidden" name="id" value={l.id} />
              <Field label="Название">
                <Input name="name" defaultValue={l.name} />
              </Field>
              <Field label="Адрес">
                <Input name="address" defaultValue={l.address ?? ""} />
              </Field>
              <Field label="Телефон">
                <Input name="phone" defaultValue={l.phone ?? ""} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isActive" value="1" defaultChecked={l.isActive} /> работает
              </label>
              <Submit variant="secondary">Сохранить</Submit>
            </Form>
          </Card>
        ))}
        <Card title="Новая точка">
          <Form action={saveLocationAction} className="space-y-2">
            <Field label="Название *">
              <Input name="name" required />
            </Field>
            <Field label="Адрес">
              <Input name="address" />
            </Field>
            <Field label="Телефон">
              <Input name="phone" />
            </Field>
            <Submit>Добавить точку</Submit>
          </Form>
        </Card>
      </div>
    </>
  );
}
