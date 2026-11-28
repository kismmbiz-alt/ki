import { requirePlatformAdmin } from "@/lib/auth";
import { companiesActivity } from "@/lib/platform/stats";
import { Badge, dOnly, dt, Input, PageHeader, Stat, Table } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { APPROVAL_COLOR, APPROVAL_LABEL } from "@/lib/platform/approval";
import { blockCompanyAction, startSupportAction } from "../actions";
import { ago, PlatformTabs } from "../tabs";

export const dynamic = "force-dynamic";

/** Подключённые мастерские и их активность. Только общие цифры, без содержимого заказов и клиентов. */
export default async function PlatformCompaniesPage() {
  const { admin } = await requirePlatformAdmin();
  const list = await companiesActivity();
  const week = Date.now() - 7 * 864e5;
  const active7 = list.filter((c) => c.lastSeenAt && c.lastSeenAt.getTime() > week).length;

  return (
    <>
      <PageHeader title="Платформа" />
      <PlatformTabs />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Мастерских" value={list.length} />
        <Stat label="Заходили за 7 дней" value={active7} />
        <Stat label="Сотрудников всего" value={list.reduce((a, c) => a + c.users, 0)} />
        <Stat label="Заказов за 30 дней" value={list.reduce((a, c) => a + c.orders30, 0)} />
      </div>
      <p className="mb-3 text-sm text-slate-500">
        Здесь только общие цифры. Посмотреть данные мастерской можно, только если её владелец сам открыл доступ: Настройки → Общие → «Доступ
        поддержки». Каждый вход записывается в журнал поддержки и в журнал действий самой мастерской.
      </p>
      <Table
        head={["Мастерская", "Владелец", "С нами с", "Последний вход", "Сотр.", "Клиенты", "Заказы", "Продажи", "Оплаты за 30 дн", "Поддержка", ""]}
      >
        {list.map((c) => (
          <tr key={c.id} className={`align-top ${c.blockedAt ? "opacity-60" : ""}`}>
            <td className="px-3 py-2">
              <div className="font-medium">{c.name}</div>
              {c.phone && <div className="text-xs text-slate-500">{c.phone}</div>}
              {c.id === admin.companyId && <Badge color="#4f6bff">ваша</Badge>}
              {c.blockedAt && <Badge color="#ef4444">приостановлена</Badge>}
              {c.approval !== "APPROVED" && <Badge color={APPROVAL_COLOR[c.approval]}>{APPROVAL_LABEL[c.approval]}</Badge>}
            </td>
            <td className="px-3 py-2">
              <div>{c.owner?.name}</div>
              <div className="text-xs text-slate-500">{c.owner?.email}</div>
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-slate-500">{dOnly(c.createdAt)}</td>
            <td className="whitespace-nowrap px-3 py-2" title={dt(c.lastSeenAt)}>
              {ago(c.lastSeenAt)}
            </td>
            <td className="px-3 py-2">{c.users}</td>
            <td className="px-3 py-2">{c.clients}</td>
            <td className="whitespace-nowrap px-3 py-2">
              {c.orders} <span className="text-xs text-slate-500">(+{c.orders30} за 30 дн)</span>
            </td>
            <td className="whitespace-nowrap px-3 py-2">
              {c.sales} <span className="text-xs text-slate-500">(+{c.sales30})</span>
            </td>
            <td className="px-3 py-2">{c.pays30}</td>
            <td className="min-w-56 px-3 py-2">
              {c.id === admin.companyId ? (
                <span className="text-xs text-slate-400">—</span>
              ) : c.supportOpen && !c.blockedAt ? (
                <Form action={startSupportAction} className="space-y-1" resetOnOk={false}>
                  <input type="hidden" name="companyId" value={c.id} />
                  <div className="text-xs text-green-700">
                    Открыт до {dt(c.supportUntil)}, {c.supportWrite ? "можно менять" : "только просмотр"}
                  </div>
                  <Input name="reason" placeholder="Зачем входите (в журнал)" required className="!py-1 text-xs" />
                  <Submit variant="secondary" className="!px-2 !py-1 text-xs">
                    Войти как поддержка
                  </Submit>
                </Form>
              ) : (
                <span className="text-xs text-slate-400">не открыт</span>
              )}
            </td>
            <td className="px-3 py-2">
              {c.id !== admin.companyId && (
                <Form action={blockCompanyAction} resetOnOk={false}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="block" value={c.blockedAt ? "0" : "1"} />
                  <Submit variant={c.blockedAt ? "secondary" : "danger"} className="!px-2 !py-1 text-xs">
                    {c.blockedAt ? "Вернуть доступ" : "Приостановить"}
                  </Submit>
                </Form>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
