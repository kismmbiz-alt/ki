"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { History } from "lucide-react";
import { historyAction, type HistoryState } from "./actions";
import { inputCls } from "@/components/ui";

const rub = (k: number) => (k / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₽";

function Buttons() {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap gap-2">
      <button name="dryRun" value="1" disabled={pending} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">
        {pending ? "Проверяю…" : "Проверить"}
      </button>
      <button name="dryRun" value="0" disabled={pending} className="rounded-lg bg-[#4f6bff] px-3.5 py-2 text-sm font-medium on-accent hover:bg-[#3d58ea] disabled:opacity-50">
        Перенести
      </button>
    </div>
  );
}

/** Перенос заказов и продаж с датами из LiveSklad. Данные готовит Claude. */
export function HistoryForm() {
  const [state, action] = useActionState<HistoryState, FormData>(historyAction, undefined);
  const r = state?.report;
  return (
    <form action={action} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2" data-history-import>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <History size={18} className="text-blue-600" /> Заказы и продажи из LiveSklad (с датами)
      </div>
      <p className="text-sm text-slate-500">
        Переносит прошлые заказы с работами, запчастями и оплатами и прошлые продажи с их настоящими датами, чтобы отчёты и касса за прошлые месяцы сошлись. Остатки на складе не меняются.
        Уже перенесённые номера пропускаются, так что повторный перенос ничего не задвоит.
      </p>
      <textarea name="json" rows={4} placeholder="Данные (JSON)" className={`${inputCls} font-mono text-xs`} />
      <input type="file" name="file" accept=".json" className="block w-full text-sm text-slate-600" />
      <Buttons />
      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {r && (
        <div className={`space-y-1 rounded-lg px-3 py-2 text-sm ${state?.dryRun ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}`} data-history-report>
          <div className="font-medium">{state?.dryRun ? "Проверка (ничего не перенесено):" : "Готово:"}</div>
          <div>
            Заказов: <b>{r.orders}</b> (оплачено {rub(r.orderPaid)}), продаж: <b>{r.sales}</b> (оплачено {rub(r.salesPaid)})
          </div>
          <div>
            Новых клиентов: <b>{r.clients}</b>, новых товаров в справочнике: <b>{r.products}</b>
          </div>
          {(r.skippedOrders.length > 0 || r.skippedSales.length > 0) && (
            <div className="text-xs">
              Уже были, пропущены: заказов {r.skippedOrders.length}, продаж {r.skippedSales.length}
            </div>
          )}
          {r.errors.length > 0 && (
            <ul className="text-xs text-red-600">
              {r.errors.slice(0, 30).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
