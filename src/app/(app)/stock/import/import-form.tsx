"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FileSpreadsheet } from "lucide-react";
import { importAction, type ImportState } from "./actions";

const LABEL: Record<string, string> = {
  name: "Название / имя",
  sku: "Код",
  barcode: "Штрихкод",
  group: "Группа",
  supplier: "Поставщик",
  qty: "Остаток",
  minQty: "Мин. остаток",
  cost: "Закупочная",
  price: "Розничная",
  repairPrice: "Ремонтная",
  minPrice: "Минимальная",
  phone: "Телефон",
  email: "Почта",
  address: "Адрес",
  source: "Источник",
  notes: "Заметки",
};

function Buttons() {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap gap-2">
      <button name="dryRun" value="1" disabled={pending} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">
        {pending ? "Читаю файл…" : "Проверить файл"}
      </button>
      <button name="dryRun" value="0" disabled={pending} className="rounded-lg bg-[#4f6bff] px-3.5 py-2 text-sm font-medium on-accent hover:bg-[#3d58ea] disabled:opacity-50">
        Загрузить
      </button>
    </div>
  );
}

export function ImportForm({ kind, title, hint }: { kind: "products" | "clients"; title: string; hint: string }) {
  const [state, action] = useActionState<ImportState, FormData>(importAction, undefined);
  const r = state?.report;
  return (
    <form action={action} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <FileSpreadsheet size={18} className="text-green-600" /> {title}
      </div>
      <p className="text-sm text-slate-500">{hint}</p>
      <input type="hidden" name="kind" value={kind} />
      <input type="file" name="file" accept=".xlsx,.csv" required className="block w-full text-sm text-slate-600" />
      <Buttons />
      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {r && (
        <div className={`space-y-2 rounded-lg px-3 py-2 text-sm ${state?.dryRun ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}`}>
          <div className="font-medium">{state?.dryRun ? "Проверка (ничего не загружено):" : "Готово:"}</div>
          <div>
            Новых: <b>{r.created}</b>, обновится: <b>{r.updated}</b>, пропущено пустых строк: <b>{r.skipped}</b>
            {kind === "products" && (
              <>
                , остатков: <b>{r.stockRows}</b>
              </>
            )}
          </div>
          <div className="text-xs">
            Нашёл колонки:{" "}
            {Object.entries(r.columns)
              .map(([k, v]) => `${LABEL[k] ?? k} ← «${v}»`)
              .join(", ")}
          </div>
          {r.errors.length > 0 && (
            <ul className="text-xs text-red-600">
              {r.errors.slice(0, 20).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
