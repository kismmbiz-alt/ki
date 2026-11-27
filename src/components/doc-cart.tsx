"use client";

import { useMemo, useState } from "react";
import { BookOpen, FileUp, Trash2, X } from "lucide-react";
import { inputCls } from "./ui";
import { parseImport } from "./receipt-form";

type P = { id: string; name: string; sku: string | null; barcode: string | null; qty: number; cost: number };

/** Строки складского документа: поиск товара, количество, закупочная цена. */
export function DocCart({ products, mode }: { products: P[]; mode: "RECEIPT" | "TRANSFER" | "WRITEOFF" | "INVENTORY" | "SUPPLIER_RETURN" }) {
  const [rows, setRows] = useState<{ productId: string; qty: string; cost: string }[]>([]);
  const [q, setQ] = useState("");
  const [dict, setDict] = useState<string | null>(null);
  const [imp, setImp] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const needle = q.trim().toLowerCase();
  const found = needle
    ? products.filter((p) => p.barcode === q.trim() || p.sku?.toLowerCase() === needle || p.name.toLowerCase().includes(needle)).slice(0, 10)
    : [];
  const add = (p: P, clear = false) => {
    setRows((r) =>
      r.some((x) => x.productId === p.id)
        ? r.map((x) => (x.productId === p.id && mode !== "INVENTORY" ? { ...x, qty: String(Number(x.qty || 0) + 1) } : x))
        : [...r, { productId: p.id, qty: mode === "INVENTORY" ? String(p.qty) : "1", cost: String(p.cost / 100) }],
    );
    // поиск остаётся, пока человек сам его не очистит; сканер штрихкода очищает сам
    if (clear) setQ("");
  };
  const set = (i: number, k: "qty" | "cost", v: string) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const dictList = dict === null ? [] : products.filter((p) => !dict.trim() || p.name.toLowerCase().includes(dict.trim().toLowerCase()) || p.sku?.toLowerCase() === dict.trim().toLowerCase()).slice(0, 200);
  const runImport = () => {
    const lines = parseImport(imp ?? "");
    const miss: string[] = [];
    setRows((rs) => {
      const next = [...rs];
      for (const l of lines) {
        const k = l.key.toLowerCase();
        const p = products.find((x) => x.barcode === l.key || x.sku?.toLowerCase() === k) ?? products.find((x) => x.name.toLowerCase() === k);
        if (!p) {
          miss.push(l.key);
          continue;
        }
        const at = next.findIndex((x) => x.productId === p.id);
        if (at >= 0) next[at] = { ...next[at], qty: mode === "INVENTORY" ? l.qty : String(Number(next[at].qty || 0) + Number(l.qty || 0)) };
        else next.push({ productId: p.id, qty: l.qty, cost: String(p.cost / 100) });
      }
      return next;
    });
    setNote(`Строк в файле: ${lines.length}, добавлено: ${lines.length - miss.length}.${miss.length ? ` Нет на этом складе: ${miss.slice(0, 5).join(", ")}${miss.length > 5 ? "…" : ""}` : ""}`);
    setImp(null);
  };
  const dev = (r: { productId: string; qty: string }) => Number(r.qty || 0) - (byId.get(r.productId)?.qty ?? 0);
  const devSum = rows.reduce((s, r) => s + dev(r) * (byId.get(r.productId)?.cost ?? 0), 0);
  const total = rows.reduce((s, r) => s + Number(r.qty || 0) * Number(r.cost.replace(",", ".") || 0), 0);

  return (
    <div className="space-y-3">
      <input type="hidden" name="items" value={JSON.stringify(rows)} />
      <div className="relative">
        <input
          className={inputCls}
          placeholder="Найдите товар: название, код или штрихкод (Enter — добавить)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (found[0]) add(found[0], found[0].barcode === q.trim() || found[0].sku === q.trim());
            }
          }}
          autoFocus
        />
        {q && (
              <button type="button" onClick={() => setQ("")} className="absolute top-2 right-2 z-20 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Очистить поиск" title="Очистить поиск">
                <X size={14} />
              </button>
            )}
        {found.length > 0 && (
          <ul className="mt-1 w-full rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {found.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => add(p)} className="flex w-full justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-100">
                  <span className="text-slate-800">
                    {rows.some((r) => r.productId === p.id) && <span className="mr-1 text-emerald-600">✓</span>}
                    {p.name}
                  </span>
                  <span className="shrink-0 text-slate-500">ост. {p.qty}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        {mode === "INVENTORY" && (
          <button
            type="button"
            className="text-blue-600 hover:underline"
            title="Добавить все товары, которые есть на складе по учёту"
            onClick={() =>
              setRows((r) => {
                const have = new Set(r.map((x) => x.productId));
                return [...r, ...products.filter((p) => p.qty > 0 && !have.has(p.id)).map((p) => ({ productId: p.id, qty: String(p.qty), cost: String(p.cost / 100) }))];
              })
            }
          >
            Автозаполнение
          </button>
        )}
        <button type="button" className="inline-flex items-center gap-1 text-blue-600 hover:underline" onClick={() => setDict(dict === null ? "" : null)}>
          <BookOpen size={14} /> Из справочника
        </button>
        <button type="button" className="inline-flex items-center gap-1 text-blue-600 hover:underline" onClick={() => setImp(imp === null ? "" : null)}>
          <FileUp size={14} /> Из файла
        </button>
        {rows.length > 0 && (
          <button type="button" className="text-slate-500 hover:text-red-600" onClick={() => setRows([])}>
            Очистить
          </button>
        )}
      </div>
      {note && <p className="text-sm text-emerald-700">{note}</p>}
      {dict !== null && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <input className={inputCls} placeholder="Фильтр по названию" value={dict} onChange={(e) => setDict(e.target.value)} />
            <button type="button" onClick={() => setDict(null)} className="rounded p-1 text-slate-400 hover:text-slate-700" aria-label="Закрыть">
              <X size={16} />
            </button>
          </div>
          <ul className="scroll-thin max-h-64 divide-y divide-slate-100 overflow-y-auto rounded border border-slate-200 bg-white">
            {dictList.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => add(p)} className="flex w-full justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-slate-100">
                  <span>
                    {rows.some((r) => r.productId === p.id) && <span className="mr-1 text-emerald-600">✓</span>}
                    {p.name}
                  </span>
                  <span className="shrink-0 text-slate-500">ост. {p.qty}</span>
                </button>
              </li>
            ))}
            {!dictList.length && <li className="px-3 py-2 text-sm text-slate-400">Ничего не найдено</li>}
          </ul>
        </div>
      )}
      {imp !== null && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="text-slate-500">
            Колонки: <b>название, код или штрихкод</b> · <b>{mode === "INVENTORY" ? "фактическое количество" : "количество"}</b>. Скопируйте строки из Excel и вставьте сюда или выберите файл CSV.
          </p>
          <input type="file" accept=".csv,.txt,text/csv" onChange={async (e) => e.target.files?.[0] && setImp(await e.target.files[0].text())} className="block text-xs" />
          <textarea value={imp} onChange={(e) => setImp(e.target.value)} rows={5} className={inputCls} />
          <div className="flex gap-2">
            <button type="button" onClick={runImport} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Добавить строки
            </button>
            <button type="button" onClick={() => setImp(null)} className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">
              Отмена
            </button>
          </div>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            <th className="py-1 font-medium">Товар</th>
            <th className="py-1 font-medium">{mode === "INVENTORY" ? "По учёту" : "Остаток"}</th>
            <th className="w-24 py-1 font-medium">{mode === "INVENTORY" ? "Факт" : "Кол-во"}</th>
            {mode === "RECEIPT" && <th className="w-32 py-1 pl-2 font-medium">Закупка за шт, ₽</th>}
            {mode === "INVENTORY" && <th className="py-1 pl-2 font-medium">Отклонение</th>}
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => {
            const p = byId.get(r.productId);
            return (
              <tr key={r.productId}>
                <td className="py-2 text-slate-800">{p?.name}</td>
                <td className="py-2 text-slate-500">{p?.qty}</td>
                <td className="py-2">
                  <input className={inputCls} inputMode="numeric" value={r.qty} onChange={(e) => set(i, "qty", e.target.value)} />
                </td>
                {mode === "INVENTORY" && (
                  <td className={`py-2 pl-2 whitespace-nowrap ${dev(r) < 0 ? "text-red-600" : dev(r) > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                    {dev(r) > 0 ? "+" : ""}
                    {dev(r)} шт · {((dev(r) * (p?.cost ?? 0)) / 100).toLocaleString("ru-RU")} ₽
                  </td>
                )}
                {mode === "RECEIPT" && (
                  <td className="py-2 pl-2">
                    <input className={inputCls} inputMode="decimal" value={r.cost} onChange={(e) => set(i, "cost", e.target.value)} />
                  </td>
                )}
                <td className="py-2 pl-2 text-right">
                  <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="rounded p-1 text-slate-400 hover:text-red-600" aria-label="Убрать">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-slate-400">
                Добавьте товары через поиск, справочник или из файла
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {mode === "INVENTORY" && rows.length > 0 && (
        <div className={`text-right font-semibold ${devSum < 0 ? "text-red-600" : "text-slate-900"}`}>Отклонение по закупке: {(devSum / 100).toLocaleString("ru-RU")} ₽</div>
      )}
      {mode === "RECEIPT" && rows.length > 0 && <div className="text-right font-semibold text-slate-900">Сумма закупки: {total.toLocaleString("ru-RU")} ₽</div>}
    </div>
  );
}
