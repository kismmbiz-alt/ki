"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { inputCls } from "./ui";

type P = { id: string; name: string; sku: string | null; barcode: string | null; qty: number; cost: number };

/** Строки складского документа: поиск товара, количество, закупочная цена. */
export function DocCart({ products, mode }: { products: P[]; mode: "RECEIPT" | "TRANSFER" | "WRITEOFF" | "INVENTORY" | "SUPPLIER_RETURN" }) {
  const [rows, setRows] = useState<{ productId: string; qty: string; cost: string }[]>([]);
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const needle = q.trim().toLowerCase();
  const found = needle
    ? products.filter((p) => p.barcode === q.trim() || p.sku?.toLowerCase() === needle || p.name.toLowerCase().includes(needle)).slice(0, 10)
    : [];
  const add = (p: P) => {
    setRows((r) =>
      r.some((x) => x.productId === p.id)
        ? r.map((x) => (x.productId === p.id && mode !== "INVENTORY" ? { ...x, qty: String(Number(x.qty || 0) + 1) } : x))
        : [...r, { productId: p.id, qty: mode === "INVENTORY" ? String(p.qty) : "1", cost: String(p.cost / 100) }],
    );
    setQ("");
  };
  const set = (i: number, k: "qty" | "cost", v: string) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
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
              if (found[0]) add(found[0]);
            }
          }}
          autoFocus
        />
        {found.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {found.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => add(p)} className="flex w-full justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-100">
                  <span className="text-slate-800">{p.name}</span>
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
        {rows.length > 0 && (
          <button type="button" className="text-slate-500 hover:text-red-600" onClick={() => setRows([])}>
            Очистить
          </button>
        )}
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            <th className="py-1 font-medium">Товар</th>
            <th className="py-1 font-medium">{mode === "INVENTORY" ? "По учёту" : "Остаток"}</th>
            <th className="w-24 py-1 font-medium">{mode === "INVENTORY" ? "Факт" : "Кол-во"}</th>
            {mode === "RECEIPT" && <th className="w-32 py-1 pl-2 font-medium">Закупка за шт, ₽</th>}
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
                Добавьте товары через поиск выше
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {mode === "RECEIPT" && rows.length > 0 && <div className="text-right font-semibold text-slate-900">Сумма закупки: {total.toLocaleString("ru-RU")} ₽</div>}
    </div>
  );
}
