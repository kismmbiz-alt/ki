import { placesFor } from "@/lib/domain/places";
import { CashboxField } from "@/components/place-fields";
import { requireUser } from "@/lib/auth";
import { Form, Submit } from "@/components/form";
import { Card, Field, Input, PageHeader, PhoneLinks, Section, Select, Textarea } from "@/components/ui";
import { ComboInput, TagInput } from "@/components/tag-input";
import { loadDictionaries } from "@/lib/domain/dict";
import { createOrderAction } from "../actions";

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const { clientId } = await searchParams;
  const { db, location, user, company } = await requireUser();
  const [client, staff, sources, dicts] = await Promise.all([
    clientId ? db.client.findUnique({ where: { id: clientId } }) : null,
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.adSource.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    loadDictionaries({ db, companyId: company.id }),
  ]);
  const { cashboxes } = await placesFor({ db, companyId: company.id }, location?.id, user);
  const masters = staff.filter((u) => u.role !== "MANAGER");

  return (
    <>
      <PageHeader title="Новый заказ" back="/orders">
        <span className="text-sm text-slate-500">Точка: {location?.name}</span>
      </PageHeader>
      <Form action={createOrderAction} resetOnOk={false}>
        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <Card>
            <div className="space-y-6">
              <Section title="Тип заказа">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="w-64">
                    <ComboInput name="orderType" defaultValue={dicts.ORDER_TYPE[0] ?? "Платный"} options={dicts.ORDER_TYPE} />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" name="urgent" value="1" className="h-4 w-4" /> Срочный заказ
                  </label>
                </div>
              </Section>

              <Section title="Клиент">
                {client ? (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <input type="hidden" name="clientId" value={client.id} />
                    <div>
                      <div className="font-medium text-slate-900">{client.name}</div>
                      <div className="text-slate-500">{client.phone}</div>
                    </div>
                    <PhoneLinks phone={client.phone} />
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Телефон *" hint="если клиент уже есть, заказ привяжется к нему">
                      <Input name="clientPhone" type="tel" required placeholder="+7 900 000-00-00" autoFocus />
                    </Field>
                    <Field label="Имя">
                      <Input name="clientName" placeholder="Иван Петров" />
                    </Field>
                    <Field label="Адрес">
                      <Input name="clientAddress" />
                    </Field>
                    <Field label="Рекламный источник *">
                      <Select name="adSourceId" required defaultValue="">
                        <option value="" disabled>
                          Откуда узнал о нас
                        </option>
                        {sources.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                )}
              </Section>

              <Section title="Устройство и неисправности">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Тип устройства *">
                    <ComboInput name="deviceType" defaultValue={dicts.DEVICE_TYPE[0] ?? "Телефон"} options={dicts.DEVICE_TYPE} required />
                  </Field>
                  <Field label="Марка">
                    <ComboInput name="brand" options={dicts.BRAND} placeholder="Apple" />
                  </Field>
                  <Field label="Модель">
                    <ComboInput name="model" options={dicts.MODEL} placeholder="iPhone 13" />
                  </Field>
                  <Field label="Цвет">
                    <ComboInput name="color" options={dicts.COLOR} />
                  </Field>
                  <Field label="Серийный номер / IMEI">
                    <Input name="serial" />
                  </Field>
                  <Field label="Комплектация">
                    <TagInput name="equipment" options={dicts.EQUIPMENT} placeholder="выберите или впишите" />
                  </Field>
                  <Field label="Внешний вид">
                    <TagInput name="appearance" options={dicts.APPEARANCE} placeholder="выберите или впишите" />
                  </Field>
                  <Field label="Неисправность *">
                    <TagInput name="problem" options={dicts.DEFECT} placeholder="со слов клиента" required />
                  </Field>
                </div>
              </Section>

              <Section title="Комментарий приёмщика">
                <Textarea name="notes" rows={2} placeholder="пароль, пожелания клиента" />
              </Section>
            </div>
          </Card>

          <div className="space-y-4">
            <Card title="Сроки и исполнители">
              <div className="space-y-3">
                <Field label="Крайний срок">
                  <Input name="dueDate" type="datetime-local" />
                </Field>
                <Field label="Мастер">
                  <Select name="masterId" defaultValue="">
                    <option value="">не назначен</option>
                    {masters.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Менеджер">
                  <Select name="managerId" defaultValue={user.id}>
                    {staff.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </Card>
            <Card title="Деньги">
              <div className="space-y-3">
                <Field label="Ориентировочная цена, ₽">
                  <Input name="estimatedPrice" inputMode="decimal" />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Предоплата, ₽">
                    <Input name="prepayment" inputMode="decimal" />
                  </Field>
                  <Field label="Способ">
                    <Select name="prepaymentMethod" defaultValue="CASH">
                      <option value="CASH">Наличные</option>
                      <option value="CARD">Карта</option>
                      <option value="TRANSFER">Перевод</option>
                    </Select>
                  </Field>
                </div>
                <CashboxField cashboxes={cashboxes} label="Касса для предоплаты" />
              </div>
            </Card>
            <Submit className="w-full py-3 text-base">Принять заказ</Submit>
          </div>
        </div>
      </Form>
    </>
  );
}
