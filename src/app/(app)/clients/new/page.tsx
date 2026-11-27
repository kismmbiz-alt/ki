import { requireUser } from "@/lib/auth";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { saveClientAction } from "../actions";

/** Регистрация нового клиента в бонусной программе. */
export default async function NewClientPage() {
  const { db, company } = await requireUser();
  const sources = await db.adSource.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Регистрация клиента" back="/clients" />
      <Card className="max-w-xl">
        <Form action={saveClientAction} className="space-y-3">
          <Field label="ФИО *">
            <Input name="name" required autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Телефон *" hint="по нему клиент получает и тратит баллы">
              <Input name="phone" type="tel" required placeholder="8 900 000-00-00" />
            </Field>
            <Field label="Дата рождения">
              <Input name="birthDate" type="date" />
            </Field>
          </div>
          <Field label="Email">
            <Input name="email" type="email" />
          </Field>
          <Field label="Откуда узнал">
            <Select name="adSourceId" defaultValue="">
              <option value="">—</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          {company.bonusEnabled && company.bonusWelcome > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">После регистрации клиент получит {(company.bonusWelcome / 100).toLocaleString("ru-RU")} приветственных баллов.</p>
          )}
          <Submit>Зарегистрировать</Submit>
        </Form>
      </Card>
    </>
  );
}
