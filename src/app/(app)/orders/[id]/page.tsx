import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { Form, Submit } from "@/components/form";
import { btn, Badge, Card, dOnly, dt, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { kopToInput, rub } from "@/lib/money";
import { totals } from "@/lib/domain/orders";
import { PAY_LABEL } from "@/lib/domain/cash";
import {
  addPartAction,
  addPaymentAction,
  addServiceAction,
  assignMasterAction,
  changeStatusAction,
  commentAction,
  removeItemAction,
  updateOrderAction,
} from "../actions";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, user } = await requireUser();
  const order = await db.order.findUnique({
    where: { id },
    include: {
      client: { include: { adSource: true } },
      status: true,
      master: true,
      author: true,
      location: true,
      items: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "desc" }, include: { user: true } },
    },
  });
  if (!order) notFound();
  if (!can(user.role, "allOrders") && order.masterId !== user.id) notFound();

  const [statuses, masters, services, products] = await Promise.all([
    db.orderStatus.findMany({ orderBy: { sort: "asc" } }),
    db.user.findMany({ where: { isActive: true, role: { in: ["MASTER", "OWNER", "ADMIN"] } }, orderBy: { name: "asc" } }),
    db.service.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.product.findMany({
      where: { isActive: true, stocks: { some: { locationId: order.locationId, qty: { gt: 0 } } } },
      include: { stocks: { where: { locationId: order.locationId } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const t = totals(order.items, order.payments.reduce((s, p) => s + p.amount, 0));
  const closed = order.status.kind === "CLOSED" || order.status.kind === "CANCELED";
  const canCash = can(user.role, "cash");

  return (
    <>
      <PageHeader
        back="/orders"
        title={
          <span className="flex items-center gap-3">
            Заказ №{order.number} <Badge color={order.status.color}>{order.status.name}</Badge>
          </span>
        }
      >
        <Link href={`/print/order/${order.id}?doc=receipt`} target="_blank" className={btn("secondary")}>
          Квитанция
        </Link>
        <Link href={`/print/order/${order.id}?doc=act`} target="_blank" className={btn("secondary")}>
          Акт выдачи
        </Link>
        <Link href={`/print/order/${order.id}?doc=label`} target="_blank" className={btn("secondary")}>
          Наклейка
        </Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Статус и мастер">
            <div className="grid gap-3 sm:grid-cols-2">
              <Form action={changeStatusAction} className="flex items-end gap-2" resetOnOk={false}>
                <input type="hidden" name="orderId" value={order.id} />
                <Field label="Статус" className="flex-1">
                  <Select name="statusId" defaultValue={order.statusId}>
                    {statuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Submit variant="secondary">Сменить</Submit>
              </Form>
              {can(user.role, "allOrders") ? (
                <Form action={assignMasterAction} className="flex items-end gap-2" resetOnOk={false}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <Field label="Мастер" className="flex-1">
                    <Select name="masterId" defaultValue={order.masterId ?? ""}>
                      <option value="">не назначен</option>
                      {masters.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Submit variant="secondary">Назначить</Submit>
                </Form>
              ) : (
                <div className="text-sm">Мастер: {order.master?.name ?? "—"}</div>
              )}
            </div>
          </Card>

          <Card title="Работы и запчасти">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-1">Наименование</th>
                  <th className="py-1 text-right">Кол-во</th>
                  <th className="py-1 text-right">Цена</th>
                  <th className="py-1 text-right">Сумма</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.items.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2">
                      <span className="mr-2 text-xs text-slate-400">{i.kind === "SERVICE" ? "работа" : "запчасть"}</span>
                      {i.name}
                    </td>
                    <td className="py-2 text-right">{i.qty}</td>
                    <td className="py-2 text-right">{rub(i.price)}</td>
                    <td className="py-2 text-right">{rub(i.price * i.qty)}</td>
                    <td className="py-2 text-right">
                      {!closed && (
                        <Form action={removeItemAction} resetOnOk={false}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <input type="hidden" name="itemId" value={i.id} />
                          <button className="text-xs text-red-500 hover:underline">убрать</button>
                        </Form>
                      )}
                    </td>
                  </tr>
                ))}
                {!order.items.length && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400">
                      Пока ничего не добавлено
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {!closed && (
              <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
                <Form action={addServiceAction} className="space-y-2">
                  <div className="text-xs font-semibold text-slate-600">Добавить работу</div>
                  <input type="hidden" name="orderId" value={order.id} />
                  <Select name="serviceId" defaultValue="">
                    <option value="">— своя работа —</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {rub(s.price)}
                      </option>
                    ))}
                  </Select>
                  <Input name="name" placeholder="или название работы" />
                  <div className="flex gap-2">
                    <Input name="price" placeholder="Цена, ₽ (из прайса, если пусто)" inputMode="decimal" />
                    <Input name="qty" defaultValue="1" className="w-20" inputMode="numeric" />
                  </div>
                  <Submit variant="secondary">Добавить работу</Submit>
                </Form>
                <Form action={addPartAction} className="space-y-2">
                  <div className="text-xs font-semibold text-slate-600">Запчасть со склада ({order.location.name})</div>
                  <input type="hidden" name="orderId" value={order.id} />
                  <Select name="productId" required defaultValue="">
                    <option value="" disabled>
                      {products.length ? "Выберите запчасть" : "На складе точки нет запчастей"}
                    </option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {rub(p.price)} · ост. {p.stocks[0]?.qty ?? 0}
                      </option>
                    ))}
                  </Select>
                  <div className="flex gap-2">
                    <Input name="price" placeholder="Цена, ₽ (из карточки, если пусто)" inputMode="decimal" />
                    <Input name="qty" defaultValue="1" className="w-20" inputMode="numeric" />
                  </div>
                  <Submit variant="secondary">Списать в заказ</Submit>
                </Form>
              </div>
            )}
          </Card>

          <Card title="Устройство">
            <Form action={updateOrderAction} className="grid gap-3 sm:grid-cols-2" resetOnOk={false}>
              <input type="hidden" name="orderId" value={order.id} />
              <Field label="Тип">
                <Input name="deviceType" defaultValue={order.deviceType} />
              </Field>
              <Field label="Бренд">
                <Input name="brand" defaultValue={order.brand ?? ""} />
              </Field>
              <Field label="Модель">
                <Input name="model" defaultValue={order.model ?? ""} />
              </Field>
              <Field label="Серийный номер / IMEI">
                <Input name="serial" defaultValue={order.serial ?? ""} />
              </Field>
              <Field label="Неисправность" className="sm:col-span-2">
                <Textarea name="problem" rows={2} defaultValue={order.problem} />
              </Field>
              <Field label="Комплектация">
                <Input name="equipment" defaultValue={order.equipment ?? ""} />
              </Field>
              <Field label="Внешний вид">
                <Input name="appearance" defaultValue={order.appearance ?? ""} />
              </Field>
              <Field label="Заметки">
                <Input name="notes" defaultValue={order.notes ?? ""} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ориент. цена, ₽">
                  <Input name="estimatedPrice" defaultValue={kopToInput(order.estimatedPrice)} />
                </Field>
                <Field label="Срок">
                  <Input name="dueDate" type="date" defaultValue={order.dueDate?.toISOString().slice(0, 10) ?? ""} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Submit variant="secondary">Сохранить</Submit>
              </div>
            </Form>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Клиент">
            <div className="text-sm">
              <Link href={`/clients/${order.client.id}`} className="font-medium text-blue-600 hover:underline">
                {order.client.name}
              </Link>
              <div>
                <a href={`tel:${order.client.phone}`} className="text-slate-700">
                  {order.client.phone}
                </a>
              </div>
              {order.client.adSource && <div className="text-xs text-slate-500">Источник: {order.client.adSource.name}</div>}
              <div className="mt-2 text-xs text-slate-500">
                Ссылка для клиента:{" "}
                <Link href={`/status/${order.publicToken}`} target="_blank" className="text-blue-600 hover:underline">
                  статус заказа
                </Link>
              </div>
            </div>
          </Card>

          <Card title="Оплата">
            <dl className="space-y-1 text-sm">
              <Row label="Работы" value={rub(t.services)} />
              <Row label="Запчасти" value={rub(t.parts)} />
              <Row label="Итого" value={<b>{rub(t.total)}</b>} />
              <Row label="Оплачено" value={rub(t.paid)} />
              <Row label={t.due >= 0 ? "К оплате" : "Переплата"} value={<b className={t.due > 0 ? "text-red-600" : "text-green-700"}>{rub(Math.abs(t.due))}</b>} />
              {can(user.role, "reports") && <Row label="Прибыль" value={rub(t.profit)} />}
            </dl>
            {order.payments.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
                {order.payments.map((p) => (
                  <li key={p.id} className="flex justify-between">
                    <span>
                      {dt(p.createdAt)} · {PAY_LABEL[p.method]}
                    </span>
                    <span className={p.amount < 0 ? "text-red-600" : ""}>{rub(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            {canCash && (
              <Form action={addPaymentAction} className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                <input type="hidden" name="orderId" value={order.id} />
                <div className="flex gap-2">
                  <Input name="amount" required inputMode="decimal" defaultValue={t.due > 0 ? kopToInput(t.due) : ""} placeholder="Сумма, ₽" />
                  <Select name="method" defaultValue="CASH" className="w-32">
                    <option value="CASH">Наличные</option>
                    <option value="CARD">Карта</option>
                    <option value="TRANSFER">Перевод</option>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input type="checkbox" name="refund" value="1" /> это возврат клиенту
                </label>
                <Submit className="w-full">Провести оплату</Submit>
              </Form>
            )}
          </Card>

          <Card title="История">
            <Form action={commentAction} className="mb-3 space-y-2">
              <input type="hidden" name="orderId" value={order.id} />
              <Textarea name="text" rows={2} placeholder="Комментарий" required />
              <Submit variant="secondary">Добавить</Submit>
            </Form>
            <ul className="space-y-2 text-sm">
              {order.events.map((e) => (
                <li key={e.id} className="border-l-2 border-slate-200 pl-2">
                  <div>{e.text}</div>
                  <div className="text-xs text-slate-400">
                    {dt(e.createdAt)} · {e.user?.name ?? "система"}
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 text-xs text-slate-400">
              Принял: {order.author.name}, {dt(order.createdAt)} · {order.location.name}
              {order.dueDate && <> · срок {dOnly(order.dueDate)}</>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
