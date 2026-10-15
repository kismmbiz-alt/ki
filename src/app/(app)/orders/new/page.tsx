import { requireUser } from "@/lib/auth";
import { Form, Submit } from "@/components/form";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { createOrderAction } from "../actions";

const DEVICE_TYPES = ["Телефон", "Планшет", "Ноутбук", "Компьютер", "Монитор", "Телевизор", "Часы", "Наушники", "Игровая приставка", "Фотоаппарат", "Бытовая техника"];

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const { clientId } = await searchParams;
  const { db, location } = await requireUser();
  const [client, masters, sources, brands, models] = await Promise.all([
    clientId ? db.client.findUnique({ where: { id: clientId } }) : null,
    db.user.findMany({ where: { isActive: true, role: { in: ["MASTER", "OWNER", "ADMIN"] } }, orderBy: { name: "asc" } }),
    db.adSource.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.order.findMany({ where: { brand: { not: null } }, distinct: ["brand"], select: { brand: true }, take: 300 }),
    db.order.findMany({ where: { model: { not: null } }, distinct: ["model"], select: { model: true }, take: 1000 }),
  ]);

  return (
    <>
      <PageHeader title="Новый заказ" back="/orders">
        <span className="text-sm text-slate-500">Точка: {location?.name}</span>
      </PageHeader>
      <Form action={createOrderAction} className="grid gap-4 lg:grid-cols-2" resetOnOk={false}>
        <Card title="Клиент">
          {client ? (
            <div className="text-sm">
              <input type="hidden" name="clientId" value={client.id} />
              <div className="font-medium">{client.name}</div>
              <div className="text-slate-500">{client.phone}</div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Телефон *" hint="если клиент уже есть, заказ привяжется к нему">
                <Input name="clientPhone" type="tel" required placeholder="+7 900 000-00-00" />
              </Field>
              <Field label="Имя">
                <Input name="clientName" placeholder="Иван Петров" />
              </Field>
              <Field label="Откуда узнал" className="sm:col-span-2">
                <Select name="adSourceId" required defaultValue="">
                  <option value="" disabled>
                    Выберите источник
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
        </Card>

        <Card title="Устройство">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Тип *">
              <Input name="deviceType" list="device-types" required defaultValue="Телефон" />
            </Field>
            <Field label="Бренд">
              <Input name="brand" list="brands" placeholder="Apple" />
            </Field>
            <Field label="Модель">
              <Input name="model" list="models" placeholder="iPhone 13" />
            </Field>
            <Field label="Серийный номер / IMEI">
              <Input name="serial" />
            </Field>
          </div>
          <datalist id="device-types">{DEVICE_TYPES.map((d) => <option key={d} value={d} />)}</datalist>
          <datalist id="brands">{brands.map((b) => <option key={b.brand} value={b.brand!} />)}</datalist>
          <datalist id="models">{models.map((m) => <option key={m.model} value={m.model!} />)}</datalist>
        </Card>

        <Card title="Неисправность и состояние" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Неисправность со слов клиента *" className="sm:col-span-3">
              <Textarea name="problem" required rows={2} />
            </Field>
            <Field label="Комплектация">
              <Input name="equipment" placeholder="без зарядки, в чехле" />
            </Field>
            <Field label="Внешний вид">
              <Input name="appearance" placeholder="потёртости, скол в углу" />
            </Field>
            <Field label="Заметки для мастера">
              <Input name="notes" placeholder="пароль, пожелания" />
            </Field>
          </div>
        </Card>

        <Card title="Сроки и деньги" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-5">
            <Field label="Ориентировочная цена, ₽">
              <Input name="estimatedPrice" inputMode="decimal" />
            </Field>
            <Field label="Срок готовности">
              <Input name="dueDate" type="date" />
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
            <Field label="Предоплата, ₽">
              <Input name="prepayment" inputMode="decimal" />
            </Field>
            <Field label="Способ оплаты">
              <Select name="prepaymentMethod" defaultValue="CASH">
                <option value="CASH">Наличные</option>
                <option value="CARD">Карта</option>
                <option value="TRANSFER">Перевод</option>
              </Select>
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <Submit>Принять заказ</Submit>
          </div>
        </Card>
      </Form>
    </>
  );
}
