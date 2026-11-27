import { can } from "@/lib/auth";
import { Field, Input, PageHeader, Select } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { saveSalaryPeriodAction } from "../../../settings/config-actions";
import { SalaryTabs } from "../_tabs";
import { salaryCtx } from "../_shared";

/** Зарплата → Настройка периодов: месяц или неделя, сколько, с какой даты. */
export default async function SalarySettingsPage() {
  const { company, user, periods } = await salaryCtx();
  const start = company.salaryPeriodStart ?? periods[periods.length - 1]?.from ?? new Date();
  return (
    <>
      <PageHeader title="Зарплата" />
      <SalaryTabs />
      <div className="max-w-xl space-y-4">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Здесь настраиваются периоды начислений и выплат зарплаты. От периода зависит, как группируются суммы в начислениях и статистике.
        </p>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <Form action={saveSalaryPeriodAction} resetOnOk={false} className="space-y-3">
            <Field label="Тип периода">
              <Select name="type" defaultValue={company.salaryPeriodType} disabled={!can(user, "settings")}>
                <option value="MONTH">Месяц</option>
                <option value="WEEK">Неделя</option>
              </Select>
            </Field>
            <Field label="Количество">
              <Input name="count" type="number" min={1} max={12} defaultValue={company.salaryPeriodCount} disabled={!can(user, "settings")} />
            </Field>
            <Field label="Начало первого периода">
              <Input name="start" type="date" defaultValue={start.toLocaleDateString("sv-SE")} disabled={!can(user, "settings")} />
            </Field>
            <p className="text-sm text-slate-500">
              Сейчас период: <b>{company.salaryPeriodCount} {company.salaryPeriodType === "WEEK" ? "нед." : "мес."}</b>, всего периодов: {periods.length}
            </p>
            {can(user, "settings") ? <Submit>Сохранить настройки</Submit> : <p className="text-sm text-slate-400">Менять может только владелец или администратор.</p>}
          </Form>
        </div>
      </div>
    </>
  );
}
