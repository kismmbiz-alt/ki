import { notFound } from "next/navigation";
import type { SalaryRule } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { ensurePositions } from "@/lib/domain/places";
import { loadDictionaries } from "@/lib/domain/dict";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { kopToInput } from "@/lib/money";
import { SettingsTabs } from "../../tabs";
import { saveEmployeeAction, saveSalaryRuleAction } from "../../config-actions";

const dIn = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

function RuleForm({ userId, r, kind, locations, orderTypes }: { userId: string; r?: SalaryRule; kind: "SALE" | "WORK"; locations: { id: string; name: string }[]; orderTypes: string[] }) {
  return (
    <Form action={saveSalaryRuleAction} className="space-y-2 rounded-lg border border-slate-200 p-3" resetOnOk={!r}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="kind" value={kind} />
      {r && <input type="hidden" name="id" value={r.id} />}
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Точка">
          <Select name="locationId" defaultValue={r?.locationId ?? ""}>
            <option value="">Все точки</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        {kind === "WORK" && (
          <Field label="Тип заказа">
            <Select name="orderType" defaultValue={r?.orderType ?? ""}>
              <option value="">Все типы</option>
              {orderTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Считать от">
          <Select name="base" defaultValue={r?.base ?? "PROFIT"}>
            <option value="PROFIT">валовой прибыли</option>
            <option value="REVENUE">выручки</option>
          </Select>
        </Field>
        <Field label="Процент, %">
          <Input name="percent" defaultValue={r ? String(r.percent / 100) : ""} inputMode="decimal" placeholder="напр. 7" />
        </Field>
        <Field label="Фикс за документ, ₽">
          <Input name="fixed" defaultValue={r?.fixed ? kopToInput(r.fixed) : ""} inputMode="decimal" />
        </Field>
        <Field label="Если база не меньше, ₽">
          <Input name="minBase" defaultValue={r?.minBase ? kopToInput(r.minBase) : ""} inputMode="decimal" />
        </Field>
        <Field label="Не более, ₽">
          <Input name="maxAmount" defaultValue={r?.maxAmount != null ? kopToInput(r.maxAmount) : ""} inputMode="decimal" />
        </Field>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {kind === "WORK" && (
          <>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" name="includeWorks" value="1" defaultChecked={r?.includeWorks ?? true} /> учитывать работы
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" name="includeParts" value="1" defaultChecked={r?.includeParts ?? true} /> учитывать запчасти
            </label>
          </>
        )}
        {kind === "SALE" && <input type="hidden" name="includeParts" value="1" />}
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="subtractNegative" value="1" defaultChecked={r?.subtractNegative ?? true} /> вычитать отрицательную прибыль
        </label>
        {kind === "SALE" && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="keepOnReturn" value="1" defaultChecked={r?.keepOnReturn ?? false} /> не удалять зарплату при возврате
          </label>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Submit variant={r ? "secondary" : "primary"}>{r ? "Сохранить правило" : "Добавить правило"}</Submit>
        {r && (
          <button name="delete" value="1" className="text-sm text-red-600 hover:underline">
            Удалить
          </button>
        )}
      </div>
    </Form>
  );
}

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, company, user: me } = await requirePermission("users");
  await ensurePositions({ db, companyId: company.id });
  const u = await db.user.findUnique({ where: { id }, include: { salaryRules: { orderBy: { createdAt: "asc" } } } });
  if (!u) notFound();
  const [locations, positions, warehouses, cashboxes, dicts] = await Promise.all([
    db.location.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } }),
    db.position.findMany({ orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }),
    db.warehouse.findMany({ where: { isActive: true }, include: { location: true }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }),
    db.cashbox.findMany({ where: { isActive: true }, include: { location: true }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }),
    loadDictionaries({ db, companyId: company.id }),
  ]);
  const orderTypes = dicts.ORDER_TYPE ?? [];
  const posId = u.positionId ?? positions.find((p) => p.baseRole === u.role)?.id ?? "";
  const work = u.salaryRules.filter((r) => r.kind === "WORK");
  const sale = u.salaryRules.filter((r) => r.kind === "SALE");
  return (
    <>
      <PageHeader title={`Сотрудник: ${u.name}`} back="/settings/users">
        <a href={`/salary?user=${u.id}`} className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
          Зарплата сотрудника
        </a>
      </PageHeader>
      <SettingsTabs admin />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Карточка сотрудника">
          <Form action={saveEmployeeAction} resetOnOk={false} className="space-y-4">
            <input type="hidden" name="id" value={u.id} />
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="Фамилия">
                <Input name="lastName" defaultValue={u.lastName ?? ""} />
              </Field>
              <Field label="Имя">
                <Input name="firstName" defaultValue={u.firstName ?? (u.lastName ? "" : u.name)} />
              </Field>
              <Field label="Отчество">
                <Input name="middleName" defaultValue={u.middleName ?? ""} />
              </Field>
              <Field label="Должность по трудовому договору">
                <Input name="jobTitle" defaultValue={u.jobTitle ?? ""} />
              </Field>
              <Field label="ИНН кассира">
                <Input name="cashierInn" defaultValue={u.cashierInn ?? ""} inputMode="numeric" />
              </Field>
              <Field label="Дата рождения">
                <Input name="birthDate" type="date" defaultValue={dIn(u.birthDate)} />
              </Field>
              <Field label="Email (логин)">
                <Input name="email" type="email" defaultValue={u.email} />
              </Field>
              <Field label="Телефон">
                <Input name="phone" defaultValue={u.phone ?? ""} />
              </Field>
              <Field label="Telegram">
                <Input name="telegram" defaultValue={u.telegram ?? ""} placeholder="@ник" />
              </Field>
              <Field label="Адрес" className="sm:col-span-3">
                <Input name="address" defaultValue={u.address ?? ""} />
              </Field>
              <Field label="Примечание" className="sm:col-span-3">
                <Textarea name="note" rows={2} defaultValue={u.note ?? ""} />
              </Field>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="Роль (должность с правами)">
                {u.role === "OWNER" ? (
                  <Input value="Владелец" disabled readOnly />
                ) : (
                  <Select name="positionId" defaultValue={posId}>
                    {positions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Точка">
                <Select name="locationId" defaultValue={u.locationId ?? ""}>
                  <option value="">Все точки</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Выход из системы через, дней" hint="пусто — не выходить">
                <Input name="autoLogoutDays" defaultValue={u.autoLogoutDays ? String(u.autoLogoutDays) : ""} inputMode="numeric" />
              </Field>
              <Field label="Новый пароль" hint="пусто — не менять">
                <Input name="password" type="password" minLength={8} autoComplete="new-password" />
              </Field>
              <Field label="Оклад в месяц, ₽">
                <Input name="baseSalary" defaultValue={u.baseSalary ? kopToInput(u.baseSalary) : ""} inputMode="decimal" />
              </Field>
              <Field label="% от работ (если нет правил)">
                <Input name="salaryPercent" defaultValue={String(u.salaryPercent)} inputMode="numeric" />
              </Field>
            </div>
            <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-sm font-medium text-slate-700">Доступные склады</div>
                <p className="mb-1 text-xs text-slate-500">Ничего не отмечено — доступны все.</p>
                {warehouses.map((w) => (
                  <label key={w.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="warehouseIds" value={w.id} defaultChecked={u.warehouseIds.includes(w.id)} /> {w.name} <span className="text-slate-400">· {w.location.name}</span>
                  </label>
                ))}
              </div>
              <div>
                <div className="mb-1 text-sm font-medium text-slate-700">Доступные кассы и касса по умолчанию</div>
                <p className="mb-1 text-xs text-slate-500">Ничего не отмечено — доступны все.</p>
                {cashboxes.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="cashboxIds" value={c.id} defaultChecked={u.cashboxIds.includes(c.id)} /> {c.name} <span className="text-slate-400">· {c.location?.name ?? "общая"}</span>
                    </label>
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      <input type="radio" name="defaultCashboxId" value={c.id} defaultChecked={u.defaultCashboxId === c.id} /> по умолчанию
                    </label>
                  </div>
                ))}
                <label className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                  <input type="radio" name="defaultCashboxId" value="" defaultChecked={!u.defaultCashboxId} /> касса по умолчанию — как у точки
                </label>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {u.role !== "OWNER" && u.id !== me.id && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isActive" value="1" defaultChecked={u.isActive} /> активен (может входить)
                </label>
              )}
              <Submit>Сохранить карточку</Submit>
            </div>
          </Form>
        </Card>
        <div className="space-y-4">
          <Card title="Зарплата за выполненную работу (заказы)">
            <p className="mb-2 text-xs text-slate-500">Начисляется мастеру, когда заказ выдан. Если подходит несколько правил, действует самое точное: точка и тип заказа → точка → все точки.</p>
            <div className="space-y-3">
              {work.map((r) => (
                <RuleForm key={r.id} userId={u.id} r={r} kind="WORK" locations={locations} orderTypes={orderTypes} />
              ))}
              <RuleForm userId={u.id} kind="WORK" locations={locations} orderTypes={orderTypes} />
            </div>
          </Card>
          <Card title="Зарплата за продажу">
            <p className="mb-2 text-xs text-slate-500">Начисляется продавцу за каждую продажу.</p>
            <div className="space-y-3">
              {sale.map((r) => (
                <RuleForm key={r.id} userId={u.id} r={r} kind="SALE" locations={locations} orderTypes={orderTypes} />
              ))}
              <RuleForm userId={u.id} kind="SALE" locations={locations} orderTypes={orderTypes} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
