import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import {
  btn,
  Badge,
  Card,
  dt,
  Field,
  Input,
  PageHeader,
  Select,
  Stat,
  Table,
  Textarea,
} from "@/components/ui";
import { BONUS_LABEL, maskPhone, refreshBonus } from "@/lib/domain/bonus";
import { clientStats } from "@/lib/domain/client-stats";
import { Form, Submit } from "@/components/form";
import { rub } from "@/lib/money";
import { totals } from "@/lib/domain/orders";
import { manualBonusAction, saveClientAction } from "../actions";

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ exists?: string }>;
}) {
  const { id } = await params;
  const { exists } = await searchParams;
  const { db, user, company } = await requireUser();
  const contacts = can(user, "clientContacts");
  const c = await db.client.findUnique({
    where: { id },
    include: {
      orders: {
        where: can(user, "allOrders") ? {} : { masterId: user.id },
        include: {
          status: true,
          items: true,
          payments: { select: { amount: true } },
        },
        orderBy: { number: "desc" },
      },
    },
  });
  if (!c) notFound();
  const sources = await db.adSource.findMany({ orderBy: { name: "asc" } });
  const spent = c.orders.reduce(
    (s, o) => s + o.payments.reduce((a, p) => a + p.amount, 0),
    0,
  );
  const bonus = await refreshBonus(db, company.id, c.id);
  const [history, sales, stat] = await Promise.all([
    db.bonusTx.findMany({
      where: { clientId: c.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.sale.findMany({
      where: { clientId: c.id },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    clientStats(db, [c.id]).then((m) => m.get(c.id)!),
  ]);
  const balls = (k: number) =>
    (k / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 });

  return (
    <>
      <PageHeader title={c.name} back="/clients">
        {contacts && (
          <a
            href={`/print/t?client=${c.id}`}
            target="_blank"
            className={btn("secondary")}
          >
            Акт сверки
          </a>
        )}
        <Link href={`/orders/new?clientId=${c.id}`} className={btn()}>
          + Заказ для клиента
        </Link>
      </PageHeader>
      {exists && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Клиент с таким телефоном уже зарегистрирован, открыта его карточка.
        </p>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Баллы"
          value={<span className="text-amber-700">{balls(bonus.balance)}</span>}
          sub={
            bonus.pending > 0
              ? `доступно ${balls(bonus.available)}, ещё ${balls(bonus.pending)} ожидают`
              : "все доступны"
          }
        />
        <Stat
          label="Визитов"
          value={stat.visits}
          sub={stat.lastVisit ? `последний ${dt(stat.lastVisit)}` : undefined}
        />
        <Stat label="Покупок и ремонтов на" value={rub(stat.spent)} />
        <Stat
          label="Телефон"
          value={
            <span className="text-base">
              {contacts ? c.phone : maskPhone(c.phone)}
            </span>
          }
          sub={
            contacts ? (c.email ?? undefined) : "контакты видит только владелец"
          }
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-700">
            История баллов
          </h2>
          <Table
            head={["Дата", "Операция", "Баллы", "Комментарий"]}
            empty="Баллов пока не было"
          >
            {history.map((h) => (
              <tr key={h.id}>
                <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                  {dt(h.createdAt)}
                </td>
                <td className="px-3 py-2">
                  {BONUS_LABEL[h.kind]}
                  {h.activeFrom > new Date() && (
                    <span className="ml-1 text-xs text-slate-400">
                      (с {dt(h.activeFrom)})
                    </span>
                  )}
                </td>
                <td
                  className={`px-3 py-2 font-medium ${h.amount < 0 ? "text-red-600" : "text-green-600"}`}
                >
                  {h.amount > 0 ? "+" : ""}
                  {balls(h.amount)}
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {h.comment}
                  {h.expiresAt && h.amount > 0 && (
                    <span className="ml-1 text-xs text-slate-400">
                      сгорят {dt(h.expiresAt)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <h2 className="text-sm font-semibold text-slate-700">Покупки</h2>
          <Table
            head={["Дата", "Чек", "Товары", "Сумма", "Баллами"]}
            empty="Покупок нет"
          >
            {sales.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                  {dt(s.createdAt)}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/sales/${s.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {s.isReturn ? "Возврат " : ""}№{s.number}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {s.items.map((i) => `${i.name} × ${i.qty}`).join(", ")}
                </td>
                <td
                  className={`px-3 py-2 whitespace-nowrap ${s.total < 0 ? "text-red-600" : ""}`}
                >
                  {rub(s.total)}
                </td>
                <td className="px-3 py-2 text-amber-700">
                  {s.bonusPaid ? balls(s.bonusPaid) : ""}
                </td>
              </tr>
            ))}
          </Table>
          <h2 className="text-sm font-semibold text-slate-700">
            Заказы (ремонт)
          </h2>
          <Table
            head={["№", "Дата", "Устройство", "Статус", "Сумма"]}
            empty="Заказов нет"
          >
            {c.orders.map((o) => (
              <tr key={o.id}>
                <td className="px-3 py-2">
                  <Link
                    href={`/orders/${o.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {o.number}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-500">{dt(o.createdAt)}</td>
                <td className="px-3 py-2">
                  {[o.deviceType, o.brand, o.model].filter(Boolean).join(" ")}
                </td>
                <td className="px-3 py-2">
                  <Badge color={o.status.color}>{o.status.name}</Badge>
                </td>
                <td className="px-3 py-2">
                  {rub(totals(o.items, 0, o).total)}
                </td>
              </tr>
            ))}
          </Table>
          <p className="mt-2 text-sm text-slate-500">
            Оплачено по заказам: {rub(spent)}
          </p>
        </div>
        <div className="space-y-4">
          {can(user, "bonusManual") && (
            <Card title="Начислить или списать баллы">
              <Form action={manualBonusAction} className="space-y-2">
                <input type="hidden" name="clientId" value={c.id} />
                <div className="grid grid-cols-[90px_1fr] gap-2">
                  <Select name="sign" defaultValue="+">
                    <option value="+">+ начислить</option>
                    <option value="-">− списать</option>
                  </Select>
                  <Input
                    name="amount"
                    inputMode="decimal"
                    placeholder="Баллов"
                    required
                  />
                </div>
                <Input name="comment" placeholder="За что (необязательно)" />
                <Submit variant="secondary">Провести</Submit>
              </Form>
            </Card>
          )}
          {!contacts ? (
            <Card title="Данные клиента">
              <Form
                action={saveClientAction}
                className="space-y-3"
                resetOnOk={false}
              >
                <input type="hidden" name="id" value={c.id} />
                <Field label="ФИО">
                  <Input name="name" defaultValue={c.name} />
                </Field>
                <Field label="Заметки">
                  <Textarea name="notes" defaultValue={c.notes ?? ""} />
                </Field>
                <p className="text-xs text-slate-500">
                  Телефон, почту и паспортные данные видит и меняет только
                  владелец.
                </p>
                <Submit variant="secondary">Сохранить</Submit>
              </Form>
            </Card>
          ) : (
            <Card title="Данные клиента">
              <Form
                action={saveClientAction}
                className="space-y-3"
                resetOnOk={false}
              >
                <input type="hidden" name="id" value={c.id} />
                <Field label="Имя">
                  <Input name="name" defaultValue={c.name} />
                </Field>
                <Field label="Телефон">
                  <Input name="phone" defaultValue={c.phone} />
                </Field>
                <Field label="Email">
                  <Input name="email" defaultValue={c.email ?? ""} />
                </Field>
                <Field label="Откуда узнал">
                  <Select name="adSourceId" defaultValue={c.adSourceId ?? ""}>
                    <option value="">—</option>
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Заметки">
                  <Textarea name="notes" defaultValue={c.notes ?? ""} />
                </Field>
                <details
                  className="rounded-lg bg-slate-50 p-2"
                  open={!!c.passport}
                >
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">
                    Паспорт и реквизиты (для договора скупки)
                  </summary>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Field label="Серия и номер" className="col-span-2">
                      <Input name="passport" defaultValue={c.passport ?? ""} />
                    </Field>
                    <Field label="Кем выдан" className="col-span-2">
                      <Input
                        name="passportIssuedBy"
                        defaultValue={c.passportIssuedBy ?? ""}
                      />
                    </Field>
                    <Field label="Дата выдачи">
                      <Input
                        name="passportDate"
                        type="date"
                        defaultValue={
                          c.passportDate
                            ? c.passportDate.toISOString().slice(0, 10)
                            : ""
                        }
                      />
                    </Field>
                    <Field label="Код подразделения">
                      <Input
                        name="passportCode"
                        defaultValue={c.passportCode ?? ""}
                      />
                    </Field>
                    <Field label="Дата рождения">
                      <Input
                        name="birthDate"
                        type="date"
                        defaultValue={
                          c.birthDate
                            ? c.birthDate.toISOString().slice(0, 10)
                            : ""
                        }
                      />
                    </Field>
                    <Field label="ИНН">
                      <Input name="inn" defaultValue={c.inn ?? ""} />
                    </Field>
                    <Field label="Адрес" className="col-span-2">
                      <Input name="address" defaultValue={c.address ?? ""} />
                    </Field>
                  </div>
                </details>
                <Submit variant="secondary">Сохранить</Submit>
              </Form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
