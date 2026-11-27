import { can, requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { StockTabs } from "../_ui/tabs";
import { ImportForm } from "./import-form";
import { HistoryForm } from "./history-form";

export default async function ImportPage() {
  const { user, location } = await requirePermission("stock");
  return (
    <>
      <PageHeader title="Склад" />
      <StockTabs />
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <b className="text-slate-800">Как перенести данные из старой CRM.</b> В LiveSklad откройте «Справочники → Товары» (или «Склад → Остатки») и нажмите «Экспорт».
        Сохраните файл и загрузите его сюда. Сначала нажмите «Проверить файл»: я покажу, какие колонки нашёл и сколько строк загрузится, ничего не меняя.
        Повторная загрузка того же файла не создаёт дубли: товары узнаются по коду или названию, клиенты по телефону.
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ImportForm
          kind="products"
          title="Товары и остатки"
          hint={`Колонки: наименование, код, штрихкод, группа, поставщик, количество, закупочная, розничная, ремонтная, минимальная цена. Остатки встанут на точку «${location?.name ?? ""}» ровно как в файле.`}
        />
        {can(user, "settings") && (
          <ImportForm kind="clients" title="Клиенты" hint="Колонки: ФИО или имя, телефон, почта, адрес, рекламный источник, комментарий. Строки без телефона пропускаются." />
        )}
        {can(user, "settings") && <HistoryForm />}
      </div>
    </>
  );
}
