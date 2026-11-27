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

/** Кнопка «Печать» с выбором нескольких бланков. query — откуда печатаем, напр. «order=ID». */
export function PrintMenu({ templates, query, defaults, label = "Печать" }: { templates: { id: string; name: string; group?: string }[]; query: string; defaults: string[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>(defaults.filter((d) => templates.some((t) => t.id === d)));
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
        <Printer size={16} /> {label}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 max-h-[70vh] w-72 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          {!templates.length && <div className="px-2 py-1.5 text-sm text-slate-500">Нет бланков. Добавьте их в Настройки → Печатные формы.</div>}
          {templates.map((d, i) => (
            <div key={d.id}>
              {d.group && d.group !== templates[i - 1]?.group && <div className="px-2 pt-2 text-xs font-medium uppercase text-slate-400">{d.group}</div>}
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                <input type="checkbox" checked={sel.includes(d.id)} onChange={(e) => setSel(e.target.checked ? [...sel, d.id] : sel.filter((x) => x !== d.id))} />
                {d.name}
              </label>
            </div>
          ))}
          <a
            href={sel.length ? `/print/t?tpl=${sel.join(",")}&${query}` : undefined}
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
