import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { DOC_TYPES, ensureTemplates } from "@/lib/print/templates";
import { SettingsTabs } from "../tabs";
import { restoreAllTemplatesAction, templateOpAction } from "../config-actions";

export default async function PrintsPage() {
  const { db, company } = await requirePermission("settings");
  const all = await ensureTemplates(db, company.id);
  return (
    <>
      <PageHeader title="Настройки" />
      <SettingsTabs admin />
      <p className="mb-4 text-sm text-slate-500">
        Бланки, которые печатаются из заказов, продаж, складских документов, ценники и зарплатные документы. Все бланки перенесены из LiveSklad — их можно менять, копировать и добавлять свои. Отмеченный звёздочкой
        печатается по умолчанию.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {DOC_TYPES.map((d) => {
          const list = all.filter((t) => t.docType === d.key);
          return (
            <Card
              key={d.key}
              title={d.label}
              actions={
                <form action={templateOpAction}>
                  <input type="hidden" name="op" value="new" />
                  <input type="hidden" name="docType" value={d.key} />
                  <button className="text-sm text-blue-600 hover:underline">+ Новый бланк</button>
                </form>
              }
            >
              {list.length ? (
                <ul className="divide-y divide-slate-100 text-sm">
                  {list.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 py-1.5">
                      <Link href={`/settings/prints/${t.id}`} className="text-blue-600 hover:underline">
                        {t.isDefault ? "★ " : ""}
                        {t.name}
                      </Link>
                      <span className="text-xs text-slate-400">{t.pageSize === "custom" ? `${t.width}×${t.height} мм` : t.pageSize}{t.landscape ? ", альбомная" : ""}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">Нет бланков</p>
              )}
            </Card>
          );
        })}
      </div>
      <Card title="Бланки LiveSklad" className="mt-4">
        <Form action={restoreAllTemplatesAction}>
          <p className="mb-2 text-sm text-slate-500">Если какой-то из исходных бланков удалили, его можно вернуть.</p>
          <Submit variant="secondary">Вернуть удалённые бланки</Submit>
        </Form>
      </Card>
    </>
  );
}
