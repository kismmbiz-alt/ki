"use client";

import { useState, useRef, useEffect } from "react";
import { Printer } from "lucide-react";

/** Список статусов, который сразу сохраняет выбор. */
export function AutoSubmitSelect({ name, defaultValue, children, className = "", style }: { name: string; defaultValue: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium outline-none ${className}`}
      style={style}
    >
      {children}
    </select>
  );
}

export const PRINT_DOCS = [
  { key: "receipt", label: "Квитанция о приёме" },
  { key: "act", label: "Акт выполненных работ" },
  { key: "warranty", label: "Гарантийный талон" },
  { key: "refusal", label: "Отказной лист" },
  { key: "check", label: "Товарный чек" },
  { key: "label", label: "Наклейка на устройство" },
];

/** Кнопка «Печать» с выбором нескольких документов. */
export function PrintMenu({ orderId, defaults }: { orderId: string; defaults: string[] }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>(defaults);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        <Printer size={16} /> Печать
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          {PRINT_DOCS.map((d) => (
            <label key={d.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
              <input
                type="checkbox"
                checked={sel.includes(d.key)}
                onChange={(e) => setSel(e.target.checked ? [...sel, d.key] : sel.filter((x) => x !== d.key))}
              />
              {d.label}
            </label>
          ))}
          <a
            href={sel.length ? `/print/order/${orderId}?docs=${sel.join(",")}` : undefined}
            target="_blank"
            onClick={() => setOpen(false)}
            className={`mt-2 block rounded-lg bg-[#4f6bff] px-3 py-2 text-center text-sm font-medium on-accent ${sel.length ? "" : "pointer-events-none opacity-50"}`}
          >
            Напечатать ({sel.length})
          </a>
        </div>
      )}
    </div>
  );
}
