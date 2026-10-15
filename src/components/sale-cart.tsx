"use client";

import { useMemo, useState } from "react";
import { inputCls } from "./ui";

type P = { id: string; name: string; price: number; qty: number; barcode: string | null };

export function SaleCart({ products }: { products: P[] }) {
  const [rows, setRows] = useState<{ productId: string; qty: number; price: string }[]>([]);
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const found = q.trim()
    ? products.filter((p) => p.barcode === q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : [];

  const add = (p: P) => {
    setRows((r) => {
      const ex = r.find((x) => x.productId === p.id);
      if (ex) return r.map((x) => (x.productId === p.id ? { ...x, qty: x.qty + 1 } : x));
      return [...r, { productId: p.id, qty: 1, price: String(p.price / 100) }];
    });
    setQ("");
  };
  const total = rows.reduce((s, r) => s + r.qty * Number(r.price.replace(",", ".") || 0), 0);

  return (
    <div className="space-y-3">
      <input type="hidden" name="items" value={JSON.stringify(rows)} />
      <div className="relative">
        <input
          className={inputCls}
          placeholder="Название или штрихкод (Enter — добавить)"
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
          <ul className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow">
            {found.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => add(p)} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-slate-50">
                  <span>{p.name}</span>
                  <span className="text-slate-500">
                    {(p.price / 100).toLocaleString("ru-RU")} ₽ · ост. {p.qty}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={r.productId}>
              <td className="py-2">{byId.get(r.productId)?.name}</td>
              <td className="w-20 py-2">
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={r.qty}
                  onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, qty: Math.max(1, parseInt(e.target.value || "1", 10)) } : x)))}
                />
              </td>
              <td className="w-28 py-2 pl-2">
                <input
                  className={inputCls}
                  inputMode="decimal"
                  value={r.price}
                  onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                />
              </td>
              <td className="py-2 pl-2 text-right">
                <button type="button" className="text-xs text-red-500" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                  убрать
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-right text-lg font-semibold">Итого: {total.toLocaleString("ru-RU")} ₽</div>
    </div>
  );
}
