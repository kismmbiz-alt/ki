import { requirePermission } from "@/lib/auth";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { SettingsTabs } from "../tabs";
import { saveBonusRulesAction } from "../config-actions";

const pct = (bp: number) => String(bp / 100);
const rubIn = (k: number) => (k ? String(k / 100) : "");

/** Настройки → Бонусная система. */
export default async function BonusSettingsPage() {
  const { company: c } = await requirePermission("settings");
  return (
    <>
      <PageHeader title="Настройки" />
      <SettingsTabs />
      <Form action={saveBonusRulesAction} resetOnOk={false} className="grid max-w-4xl gap-4 lg:grid-cols-2">
        <Card title="Бонусная система" className="lg:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="bonusEnabled" value="1" defaultChecked={c.bonusEnabled} className="h-4 w-4" /> Включить бонусы: начислять баллы клиентам и принимать оплату баллами
          </label>
          <p className="mt-2 text-xs text-slate-500">1 балл = 1 ₽. Баллы начисляются клиенту, которого указали в продаже или заказе (по телефону).</p>
        </Card>
        <Card title="Начисление">
          <div className="space-y-3">
            <Field label="С продаж, % от суммы чека">
              <Input name="bonusSalePct" inputMode="decimal" defaultValue={pct(c.bonusSalePct)} />
            </Field>
            <Field label="С выданных заказов (ремонт), % от суммы заказа">
              <Input name="bonusOrderPct" inputMode="decimal" defaultValue={pct(c.bonusOrderPct)} />
            </Field>
            <Field label="Минимальная сумма чека для начисления, ₽" hint="пусто — с любой суммы">
              <Input name="bonusMinCheck" inputMode="decimal" defaultValue={rubIn(c.bonusMinCheck)} />
            </Field>
            <Field label="Приветственные баллы при регистрации клиента">
              <Input name="bonusWelcome" inputMode="decimal" defaultValue={rubIn(c.bonusWelcome)} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="bonusAccrueOnBonusPay" value="1" defaultChecked={c.bonusAccrueOnBonusPay} /> Начислять баллы и на часть чека, оплаченную баллами
            </label>
          </div>
        </Card>
        <Card title="Использование и сгорание">
          <div className="space-y-3">
            <Field label="Баллами можно оплатить до, % чека">
              <Input name="bonusMaxPayPct" inputMode="decimal" defaultValue={pct(c.bonusMaxPayPct)} />
            </Field>
            <Field label="Баллы можно тратить через, дней" hint="0 — сразу после покупки">
              <Input name="bonusDelayDays" inputMode="numeric" defaultValue={String(c.bonusDelayDays)} />
            </Field>
            <Field label="Баллы сгорают через, дней" hint="0 — не сгорают никогда">
              <Input name="bonusExpireDays" inputMode="numeric" defaultValue={String(c.bonusExpireDays)} />
            </Field>
            <p className="text-xs text-slate-500">При оплате сначала тратятся баллы, которые сгорят раньше. При возврате товара начисленные за него баллы отменяются, а потраченные возвращаются клиенту.</p>
          </div>
        </Card>
        <div className="lg:col-span-2">
          <Submit>Сохранить условия</Submit>
        </div>
      </Form>
    </>
  );
}
