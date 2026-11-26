import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileText, Flame, Info, Paperclip, Trash2, Wrench } from "lucide-react";
import { can, requireUser } from "@/lib/auth";
import { Form, Submit } from "@/components/form";
import { Badge, Card, dt, Field, Input, PhoneLinks, Section, Select, Textarea, toLocalInput } from "@/components/ui";
import { ComboInput, TagInput } from "@/components/tag-input";
import { AutoSubmitSelect, PrintMenu } from "@/components/order-widgets";
import { kopToInput, rub } from "@/lib/money";
import { totals } from "@/lib/domain/orders";
import { PAY_LABEL } from "@/lib/domain/cash";
import { loadDictionaries } from "@/lib/domain/dict";
import {
  addPartAction,
  addPaymentAction,
  addServiceAction,
  changeStatusAction,
  commentAction,
  deleteFileAction,
  discountAction,
  issueOrderAction,
  removeItemAction,
  updateOrderAction,
  uploadFilesAction,
  verdictAction,
} from "../actions";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = "info" } = await searchParams;
  const { db, user, company } = await requireUser();
  const order = await db.order.findUnique({
    where: { id },
    include: {
      client: { include: { adSource: true } },
      status: true,
      master: true,
      manager: true,
      author: true,
      location: true,
      items: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "desc" }, include: { user: true } },
      files: { select: { id: true, name: true, mime: true, size: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) notFound();
  if (!can(user.role, "allOrders") && order.masterId !== user.id) notFound();

  const [statuses, staff, services, products, sources, dicts] = await Promise.all([
    db.orderStatus.findMany({ orderBy: { sort: "asc" } }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.service.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.product.findMany({
      where: { isActive: true, stocks: { some: { locationId: order.locationId, qty: { gt: 0 } } } },
      include: { stocks: { where: { locationId: order.locationId } } },
      orderBy: { name: "asc" },
    }),
    db.adSource.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    loadDictionaries({ db, companyId: company.id }),
  ]);
  const t = totals(order.items, order.payments.reduce((s, p) => s + p.amount, 0), order);
  const closed = order.status.kind === "CLOSED" || order.status.kind === "CANCELED";
  const canCash = can(user.role, "cash");
  const manage = can(user.role, "allOrders");
  const showProfit = can(user.role, "reports");
  const masters = staff.filter((u) => u.role !== "MANAGER");
  const tabLink = (k: string) =>
    `flex items-center gap-2 rounded-lg px-4 py-2 text-sm ${tab === k ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`;

  return (
    <>
      {/* Шапка заказа */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/orders" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Назад">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Заказ №{order.number}</h1>
          {order.urgent && (
            <span className="inline-flex items-center gap-1 rounded-md bg-orange-600/15 px-2 py-0.5 text-xs font-medium text-orange-600">
              <Flame size={13} /> Срочно
            </span>
          )}
          {closed ? (
            <Badge color={order.status.color}>{order.status.name}</Badge>
          ) : (
            <Form action={changeStatusAction} resetOnOk={false}>
              <input type="hidden" name="orderId" value={order.id} />
              <AutoSubmitSelect
                name="statusId"
                defaultValue={order.statusId}
                style={{ color: order.status.color, borderColor: order.status.color + "88", backgroundColor: order.status.color + "1a" }}
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.kind === "CLOSED"}>
                    {s.name}
                    {s.kind === "CLOSED" ? " (кнопка «Выдать»)" : ""}
                  </option>
                ))}
              </AutoSubmitSelect>
            </Form>
          )}
          <span className="text-sm text-slate-500">{order.orderType}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PrintMenu orderId={order.id} defaults={closed ? ["act", "warranty"] : ["receipt"]} />
          {!closed && canCash && (
            <a href="#issue" className="inline-flex items-center gap-1.5 rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium on-accent hover:bg-[#15803d]">
              <CheckCircle2 size={16} /> Выдать
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            <Link href={`/orders/${order.id}?tab=info`} className={tabLink("info")} scroll={false}>
              <Info size={16} /> Информация о заказе
            </Link>
            <Link href={`/orders/${order.id}?tab=works`} className={tabLink("works")} scroll={false}>
              <Wrench size={16} /> Работы и материалы
              {order.items.length > 0 && <span className="rounded bg-blue-600 px-1.5 text-xs on-accent">{order.items.length}</span>}
            </Link>
          </div>

          {tab !== "works" ? (
            <>
              <Card>
                <Form action={updateOrderAction} resetOnOk={false} className="space-y-6">
                  <input type="hidden" name="orderId" value={order.id} />
                  <Section title="Тип заказа">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="w-64">
                        <ComboInput name="orderType" defaultValue={order.orderType} options={dicts.ORDER_TYPE} />
                      </div>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" name="urgent" value="1" defaultChecked={order.urgent} className="h-4 w-4" /> Срочный заказ
                      </label>
                    </div>
                  </Section>

                  <Section title="Клиент">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {manage ? (
                        <Field label="Имя">
                          <Input name="clientName" defaultValue={order.client.name} />
                        </Field>
                      ) : (
                        <Field label="Имя">
                          <div className="py-2 text-sm">{order.client.name}</div>
                        </Field>
                      )}
                      <Field label="Телефон">
                        <div className="flex flex-wrap items-center gap-2 py-1">
                          <Link href={`/clients/${order.client.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                            {order.client.phone}
                          </Link>
                          <PhoneLinks phone={order.client.phone} />
                        </div>
                      </Field>
                      {manage && (
                        <>
                          <Field label="Адрес">
                            <Input name="clientAddress" defaultValue={order.client.address ?? ""} />
                          </Field>
                          <Field label="Рекламный источник">
                            <Select name="adSourceId" defaultValue={order.client.adSourceId ?? ""}>
                              <option value="">—</option>
                              {sources.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </Select>
                          </Field>
                        </>
                      )}
                    </div>
                  </Section>

                  <Section title="Устройство и неисправности">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Тип устройства">
                        <ComboInput name="deviceType" defaultValue={order.deviceType} options={dicts.DEVICE_TYPE} />
                      </Field>
                      <Field label="Марка">
                        <ComboInput name="brand" defaultValue={order.brand} options={dicts.BRAND} />
                      </Field>
                      <Field label="Модель">
                        <ComboInput name="model" defaultValue={order.model} options={dicts.MODEL} />
                      </Field>
                      <Field label="Цвет">
                        <ComboInput name="color" defaultValue={order.color} options={dicts.COLOR} />
                      </Field>
                      <Field label="Серийный номер / IMEI">
                        <Input name="serial" defaultValue={order.serial ?? ""} />
                      </Field>
                      <Field label="Комплектация">
                        <TagInput name="equipment" defaultValue={order.equipment} options={dicts.EQUIPMENT} />
                      </Field>
                      <Field label="Внешний вид">
                        <TagInput name="appearance" defaultValue={order.appearance} options={dicts.APPEARANCE} />
                      </Field>
                      <Field label="Неисправность">
                        <TagInput name="problem" defaultValue={order.problem} options={dicts.DEFECT} required />
                      </Field>
                    </div>
                  </Section>

                  <Section title="Дополнительная информация">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Ориентировочная цена, ₽">
                        <Input name="estimatedPrice" inputMode="decimal" defaultValue={kopToInput(order.estimatedPrice)} />
                      </Field>
                      <Field label="Крайний срок">
                        <Input name="dueDate" type="datetime-local" defaultValue={toLocalInput(order.dueDate)} />
                      </Field>
                      {manage ? (
                        <>
                          <Field label="Мастер">
                            <Select name="masterId" defaultValue={order.masterId ?? ""}>
                              <option value="">не назначен</option>
                              {masters.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label="Менеджер">
                            <Select name="managerId" defaultValue={order.managerId ?? ""}>
                              <option value="">—</option>
                              {staff.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </Select>
                          </Field>
                        </>
                      ) : (
                        <Field label="Мастер / менеджер">
                          <div className="py-2 text-sm">
                            {order.master?.name ?? "—"} / {order.manager?.name ?? "—"}
                          </div>
                        </Field>
                      )}
                      <Field label="Комментарий приёмщика" className="sm:col-span-2">
                        <Textarea name="notes" rows={2} defaultValue={order.notes ?? ""} placeholder="пароль, пожелания клиента" />
                      </Field>
                      <Field label="Вердикт / рекомендации клиенту" className="sm:col-span-2">
                        <Textarea name="verdict" rows={2} defaultValue={order.verdict ?? ""} maxLength={2000} />
                      </Field>
                    </div>
                  </Section>
                  <div className="flex justify-end">
                    <Submit>Сохранить</Submit>
                  </div>
                </Form>
              </Card>

              <Card title="Файлы и фото">
                <div className="flex flex-wrap gap-3">
                  {order.files.map((f) => (
                    <div key={f.id} className="group relative w-32">
                      <a href={`/files/${f.id}`} target="_blank" className="block overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        {f.mime.startsWith("image/") && !f.mime.includes("svg") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/files/${f.id}`} alt={f.name} className="h-24 w-full object-cover" />
                        ) : (
                          <div className="flex h-24 items-center justify-center text-slate-400">
                            <FileText size={28} />
                          </div>
                        )}
                      </a>
                      <div className="mt-1 truncate text-xs text-slate-500" title={f.name}>
                        {f.name}
                      </div>
                      <Form action={deleteFileAction} resetOnOk={false} className="absolute top-1 right-1 hidden group-hover:block">
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="fileId" value={f.id} />
                        <button className="rounded-md bg-[#000000aa] p-1 on-accent" aria-label="Удалить файл">
                          <Trash2 size={14} />
                        </button>
                      </Form>
                    </div>
                  ))}
                </div>
                <Form action={uploadFilesAction} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="orderId" value={order.id} />
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-500 hover:border-blue-500 hover:text-blue-600">
                    <Paperclip size={16} />
                    <input type="file" name="files" multiple accept="image/*,application/pdf" className="text-sm" />
                  </label>
                  <Submit variant="secondary">Загрузить</Submit>
                </Form>
              </Card>
            </>
          ) : (
            <Card>
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-slate-500">
                    <tr className="border-b border-slate-200">
                      <th className="py-2 font-medium">Наименование</th>
                      <th className="py-2 text-right font-medium">Кол-во</th>
                      <th className="py-2 text-right font-medium">Гарантия</th>
                      <th className="py-2 text-right font-medium">Цена</th>
                      <th className="py-2 text-right font-medium">Сумма</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {order.items.map((i) => (
                      <tr key={i.id}>
                        <td className="py-2.5">
                          <span className={`mr-2 rounded px-1.5 py-0.5 text-[11px] ${i.kind === "SERVICE" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
                            {i.kind === "SERVICE" ? "работа" : "запчасть"}
                          </span>
                          {i.name}
                        </td>
                        <td className="py-2.5 text-right">{i.qty}</td>
                        <td className="py-2.5 text-right text-slate-500">{i.warrantyDays ? `${i.warrantyDays} дн.` : "—"}</td>
                        <td className="py-2.5 text-right">{rub(i.price)}</td>
                        <td className="py-2.5 text-right font-medium">{rub(i.price * i.qty)}</td>
                        <td className="py-2.5 pl-2 text-right">
                          {!closed && (
                            <Form action={removeItemAction} resetOnOk={false}>
                              <input type="hidden" name="orderId" value={order.id} />
                              <input type="hidden" name="itemId" value={i.id} />
                              <button className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Убрать">
                                <Trash2 size={15} />
                              </button>
                            </Form>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!order.items.length && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          Добавьте выполненные работы и запчасти
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-start justify-between gap-4 border-t border-slate-100 pt-4">
                {canCash && !closed ? (
                  <Form action={discountAction} resetOnOk={false} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="orderId" value={order.id} />
                    <Field label="Скидка, %" className="w-24">
                      <Input name="discountPct" inputMode="numeric" defaultValue={order.discountPct || ""} />
                    </Field>
                    <Field label="Скидка, ₽" className="w-28">
                      <Input name="discountSum" inputMode="decimal" defaultValue={kopToInput(order.discountSum || null)} />
                    </Field>
                    <Submit variant="secondary">Применить</Submit>
                  </Form>
                ) : (
                  <div />
                )}
                <dl className="min-w-[220px] space-y-1 text-sm">
                  {t.discount > 0 && <Row label="Без скидки" value={rub(t.subtotal)} />}
                  {t.discount > 0 && <Row label="Скидка" value={<span className="text-red-600">−{rub(t.discount)}</span>} />}
                  <Row label="Всего" value={<b className="text-lg">{rub(t.total)}</b>} />
                  {showProfit && <Row label="Валовая прибыль" value={rub(t.profit)} />}
                </dl>
              </div>

              {!closed && (
                <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-2">
                  <Form action={addServiceAction} className="space-y-2 rounded-xl bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">Добавить работу</div>
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
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Цена, ₽">
                        <Input name="price" placeholder="из прайса" inputMode="decimal" />
                      </Field>
                      <Field label="Кол-во">
                        <Input name="qty" defaultValue="1" inputMode="numeric" />
                      </Field>
                      <Field label="Гарантия, дн.">
                        <Input name="warrantyDays" inputMode="numeric" defaultValue={company.warrantyDays || ""} />
                      </Field>
                    </div>
                    <Submit variant="secondary">Добавить работу</Submit>
                  </Form>
                  <Form action={addPartAction} className="space-y-2 rounded-xl bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">Запчасть со склада ({order.location.name})</div>
                    <input type="hidden" name="orderId" value={order.id} />
                    <Select name="productId" required defaultValue="">
                      <option value="" disabled>
                        {products.length ? "Выберите запчасть" : "На складе точки нет запчастей"}
                      </option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {rub(p.repairPrice ?? p.price)} · ост. {p.stocks[0]?.qty ?? 0}
                        </option>
                      ))}
                    </Select>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Цена, ₽">
                        <Input name="price" placeholder="из карточки" inputMode="decimal" />
                      </Field>
                      <Field label="Кол-во">
                        <Input name="qty" defaultValue="1" inputMode="numeric" />
                      </Field>
                      <Field label="Гарантия, дн.">
                        <Input name="warrantyDays" inputMode="numeric" defaultValue={company.warrantyDays || ""} />
                      </Field>
                    </div>
                    <Submit variant="secondary">Списать в заказ</Submit>
                  </Form>
                </div>
              )}

              <Form action={verdictAction} resetOnOk={false} className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                <input type="hidden" name="orderId" value={order.id} />
                <Field label="Вердикт / рекомендации клиенту">
                  <Textarea name="verdict" rows={2} defaultValue={order.verdict ?? ""} maxLength={2000} />
                </Field>
                <Submit variant="secondary">Сохранить вердикт</Submit>
              </Form>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card title="Оплата">
            <dl className="space-y-1 text-sm">
              <Row label="Работы" value={rub(t.services)} />
              <Row label="Запчасти" value={rub(t.parts)} />
              {t.discount > 0 && <Row label="Скидка" value={`−${rub(t.discount)}`} />}
              <Row label="Итого" value={<b>{rub(t.total)}</b>} />
              <Row label="Оплачено" value={rub(t.paid)} />
              <Row
                label={t.due >= 0 ? "К оплате" : "Переплата"}
                value={<b className={t.due > 0 ? "text-red-600" : "text-green-600"}>{rub(Math.abs(t.due))}</b>}
              />
              {order.estimatedPrice ? <Row label="Ориент. цена" value={<span className="text-slate-500">{rub(order.estimatedPrice)}</span>} /> : null}
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
                  <Input name="amount" required inputMode="decimal" placeholder="Сумма, ₽" />
                  <Select name="method" defaultValue="CASH" className="w-32">
                    <option value="CASH">Наличные</option>
                    <option value="CARD">Карта</option>
                    <option value="TRANSFER">Перевод</option>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input type="checkbox" name="refund" value="1" /> это возврат клиенту
                </label>
                <Submit variant="secondary" className="w-full">
                  Внести оплату / предоплату
                </Submit>
              </Form>
            )}
          </Card>

          {!closed && canCash && (
            <section id="issue" className="rounded-xl border border-green-600/40 bg-green-50 p-4">
              <div className="mb-2 text-sm font-semibold text-green-700">Выдача заказа</div>
              <Form action={issueOrderAction} resetOnOk={false} className="space-y-2">
                <input type="hidden" name="orderId" value={order.id} />
                {t.due > 0 ? (
                  <>
                    <input type="hidden" name="takePayment" value="1" />
                    <div className="text-sm text-slate-700">
                      Клиент доплачивает <b>{rub(t.due)}</b>
                    </div>
                    <Select name="method" defaultValue="CASH">
                      <option value="CASH">Наличные</option>
                      <option value="CARD">Карта</option>
                      <option value="TRANSFER">Перевод</option>
                    </Select>
                    <Submit variant="success" className="w-full">
                      Принять {rub(t.due)} и выдать
                    </Submit>
                  </>
                ) : (
                  <Submit variant="success" className="w-full">
                    Выдать клиенту
                  </Submit>
                )}
              </Form>
            </section>
          )}

          <Card title="История">
            <Form action={commentAction} className="mb-4 space-y-2">
              <input type="hidden" name="orderId" value={order.id} />
              <Textarea name="text" rows={2} placeholder="Комментарий…" required />
              <Submit variant="secondary">Добавить комментарий</Submit>
            </Form>
            <ol className="relative space-y-3 border-l-2 border-slate-200 pl-4">
              {order.events.map((e) => (
                <li key={e.id} className="relative text-sm">
                  <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-600" />
                  <div className="whitespace-pre-line text-slate-800">{e.text}</div>
                  <div className="text-xs text-slate-400">
                    {dt(e.createdAt)} · {e.user?.name ?? "система"}
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
              Принял: {order.author.name}, {dt(order.createdAt)} · {order.location.name}
              <br />
              Ссылка для клиента:{" "}
              <Link href={`/status/${order.publicToken}`} target="_blank" className="text-blue-600 hover:underline">
                статус заказа
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
