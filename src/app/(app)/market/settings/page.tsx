import { requirePermission } from "@/lib/auth";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { kopToInput } from "@/lib/money";
import { MarketTabs } from "../tabs";
import { saveMarketSettingsAction } from "../actions";

/** Настройки рынка: сколько хотим заработать на выкупе, бонусы сотрудникам и регион Авито. */
export default async function MarketSettingsPage() {
  const ctx = await requirePermission("buybackSources");
  const c = ctx.company;
  const status = [
    { name: "ВКонтакте", ok: !!process.env.VK_SERVICE_TOKEN, hint: "нужен сервисный ключ VK_SERVICE_TOKEN" },
    { name: "Telegram", ok: true, hint: "" },
    { name: "Авито", ok: !!process.env.AVITO_PROXY, hint: "нужен мобильный прокси AVITO_PROXY" },
  ];

  return (
    <>
      <PageHeader title="Рынок · настройки" />
      <MarketTabs user={ctx.user} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Цена выкупа и бонусы" className="lg:col-span-2">
          <Form action={saveMarketSettingsAction} className="grid gap-3 sm:grid-cols-2" resetOnOk={false}>
            <Field label="Сколько хотим заработать с одного выкупа, ₽" hint="предложенная цена = средняя цена рынка минус эта сумма">
              <Input name="marketMargin" inputMode="decimal" required defaultValue={kopToInput(c.marketMargin)} />
            </Field>
            <Field label="Регион Авито" hint="как в адресе сайта: moskva, sankt-peterburg или rossiya — вся Россия">
              <Input name="avitoRegion" defaultValue={c.avitoRegion} />
            </Field>
            <Field label="Бонус за каждый выкуп, ₽" hint="начисляется сразу, как только выкуп записан">
              <Input name="bonusFixed" inputMode="decimal" defaultValue={kopToInput(c.bonusFixed)} />
            </Field>
            <Field label="Бонус с прибыли после продажи, %" hint="0 — не начислять">
              <Input name="bonusPercent" inputMode="numeric" defaultValue={String(c.bonusPercent)} />
            </Field>
            <p className="text-xs text-slate-500 sm:col-span-2">
              Бонусы видны во вкладке «Результаты». CRM их только считает — выплачивайте сами, например через кассу со статьёй «Зарплата».
            </p>
            <div className="sm:col-span-2">
              <Submit>Сохранить</Submit>
            </div>
          </Form>
        </Card>
        <Card title="Подключение площадок">
          <ul className="space-y-2 text-sm">
            {status.map((s) => (
              <li key={s.name} className="flex items-start gap-2">
                <span className={s.ok ? "text-green-700" : "text-red-700"}>{s.ok ? "●" : "○"}</span>
                <span>
                  <b>{s.name}</b>: {s.ok ? "работает" : s.hint}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
