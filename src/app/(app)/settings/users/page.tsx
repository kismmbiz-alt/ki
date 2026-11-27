import { requirePermission } from "@/lib/auth";
import { ensurePositions } from "@/lib/domain/places";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { SettingsTabs } from "../tabs";
import { createUserAction, updateUserAction } from "../actions";

export default async function UsersPage() {
  const { db, user: me, company } = await requirePermission("users");
  await ensurePositions({ db, companyId: company.id });
  const [users, locations, positions] = await Promise.all([
    db.user.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "asc" }] }),
    db.location.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } }),
    db.position.findMany({ orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }),
  ]);
  const posName = new Map(positions.map((p) => [p.id, p.name]));
  const posOf = (u: { positionId: string | null; role: string }) => u.positionId ?? positions.find((p) => p.baseRole === u.role)?.id ?? "";
  const locOptions = (
    <>
      <option value="">Все точки</option>
      {locations.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </>
  );
  const roleOptions = positions.map((p) => (
    <option key={p.id} value={p.id}>
      {p.name}
    </option>
  ));

  return (
    <>
      <PageHeader title="Настройки" />
      <SettingsTabs admin />
      <div className="grid gap-4 lg:grid-cols-2">
        {users.map((u) => (
          <Card key={u.id} title={`${u.name} · ${u.role === "OWNER" ? "Владелец" : (posName.get(posOf(u)) ?? "")}${u.isActive ? "" : " (отключён)"}`}>
            <Form action={updateUserAction} className="grid grid-cols-2 gap-2" resetOnOk={false}>
              <input type="hidden" name="id" value={u.id} />
              <Field label="Имя">
                <Input name="name" defaultValue={u.name} />
              </Field>
              <Field label="Телефон">
                <Input name="phone" defaultValue={u.phone ?? ""} />
              </Field>
              <Field label="Email (логин)">
                <Input value={u.email} disabled readOnly />
              </Field>
              <Field label="Должность">
                {u.role === "OWNER" ? (
                  <Input value="Владелец" disabled readOnly />
                ) : (
                  <Select name="positionId" defaultValue={posOf(u)}>
                    {roleOptions}
                  </Select>
                )}
              </Field>
              <Field label="Точка">
                <Select name="locationId" defaultValue={u.locationId ?? ""}>
                  {locOptions}
                </Select>
              </Field>
              <Field label="% от работ (зарплата)">
                <Input name="salaryPercent" defaultValue={String(u.salaryPercent)} inputMode="numeric" />
              </Field>
              <Field label="Новый пароль" hint="оставьте пустым, чтобы не менять">
                <Input name="password" type="password" minLength={8} />
              </Field>
              <div className="flex items-end gap-3">
                {u.role !== "OWNER" && u.id !== me.id && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="isActive" value="1" defaultChecked={u.isActive} /> активен
                  </label>
                )}
                <Submit variant="secondary">Сохранить</Submit>
              </div>
            </Form>
          </Card>
        ))}
        <Card title="Новый сотрудник">
          <Form action={createUserAction} className="grid grid-cols-2 gap-2">
            <Field label="Имя *">
              <Input name="name" required />
            </Field>
            <Field label="Телефон">
              <Input name="phone" />
            </Field>
            <Field label="Email для входа *">
              <Input name="email" type="email" required />
            </Field>
            <Field label="Пароль *">
              <Input name="password" type="password" required minLength={8} />
            </Field>
            <Field label="Должность">
              <Select name="positionId" defaultValue={positions.find((p) => p.baseRole === "MASTER")?.id}>
                {roleOptions}
              </Select>
            </Field>
            <Field label="Точка">
              <Select name="locationId" defaultValue="">
                {locOptions}
              </Select>
            </Field>
            <Field label="% от работ">
              <Input name="salaryPercent" inputMode="numeric" defaultValue="0" />
            </Field>
            <div className="flex items-end">
              <Submit>Добавить</Submit>
            </div>
          </Form>
          <p className="mt-3 text-xs text-slate-500">
            Что может каждая должность, настраивается во вкладке{" "}
            <a href="/settings/positions" className="text-blue-600 hover:underline">
              «Должности и права»
            </a>
            .
          </p>
        </Card>
      </div>
    </>
  );
}
