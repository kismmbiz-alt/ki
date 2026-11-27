"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

// Выбор периода как в LiveSklad: поле «дд.мм.гггг – дд.мм.гггг», по нажатию окошко с двумя месяцами
// и быстрыми вариантами сбоку (сегодня, вчера, 7 дней, этот месяц, прошлый месяц, год…).

import { iso, parse, presets, periodLabel } from "@/lib/period-presets";

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const DOW = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

function Month({ base, from, to, hover, onPick, onHover }: { base: Date; from: Date | null; to: Date | null; hover: Date | null; onPick: (d: Date) => void; onHover: (d: Date | null) => void }) {
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const end = to ?? (from && hover && hover >= from ? hover : null);
  const todayS = iso(new Date());
  return (
    <div className="w-[238px]">
      <div className="grid grid-cols-7 text-center text-xs text-slate-400">
        {DOW.map((x) => (
          <div key={x} className="py-1">
            {x}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 text-center text-sm" onMouseLeave={() => onHover(null)}>
        {days.map((d) => {
          const out = d.getMonth() !== base.getMonth();
          const isFrom = from && iso(d) === iso(from);
          const isTo = end && iso(d) === iso(end);
          const inside = from && end && d > from && d < end;
          return (
            <button
              key={d.getTime()}
              type="button"
              onClick={() => onPick(d)}
              onMouseEnter={() => onHover(d)}
              className={`h-8 ${out ? "text-slate-300" : "text-slate-700"} ${inside ? "bg-blue-50" : ""} ${isFrom || isTo ? "rounded-md bg-blue-600 font-semibold text-white" : "rounded-md hover:bg-slate-100"} ${iso(d) === todayS && !isFrom && !isTo ? "ring-1 ring-blue-400 ring-inset" : ""}`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Поле периода для GET-форм и фильтров. Пишет даты в скрытые поля fromName/toName (ГГГГ-ММ-ДД).
 * autoSubmit — после выбора сразу отправляет форму, в которой стоит.
 */
export function PeriodPicker({
  from,
  to,
  fromName = "from",
  toName = "to",
  placeholder = "Период",
  autoSubmit = true,
  clearable = true,
  className = "w-60",
}: {
  from?: string | null;
  to?: string | null;
  fromName?: string;
  toName?: string;
  placeholder?: string;
  autoSubmit?: boolean;
  clearable?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [a, setA] = useState(from ?? "");
  const [b, setB] = useState(to ?? "");
  const [picking, setPicking] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);
  const [view, setView] = useState(() => {
    const d = parse(from) ?? new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const box = useRef<HTMLDivElement>(null);
  const list = useMemo(() => presets(), []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const apply = (f: string, t: string) => {
    setA(f);
    setB(t);
    setPicking(null);
    setOpen(false);
    if (autoSubmit) {
      const form = box.current?.closest("form");
      // даём React записать новые значения в скрытые поля
      if (form) setTimeout(() => form.requestSubmit(), 0);
    }
  };
  const pick = (d: Date) => {
    if (!picking) {
      setPicking(d);
      setA(iso(d));
      setB("");
    } else {
      const [x, y] = d < picking ? [d, picking] : [picking, d];
      apply(iso(x), iso(y));
    }
  };
  const second = new Date(view.getFullYear(), view.getMonth() + 1, 1);
  const fromD = picking ?? parse(a);
  const toD = picking ? null : parse(b);
  const label = periodLabel(a, b);

  return (
    <div ref={box} className={`relative ${className}`}>
      <input type="hidden" name={fromName} value={a} />
      <input type="hidden" name={toName} value={b} />
      <button
        type="button"
        onClick={() => {
          const r = box.current?.getBoundingClientRect();
          setAlignRight(!!r && r.left > window.innerWidth / 2);
          setOpen((o) => !o);
        }}
        className={`flex h-[38px] w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-left text-sm ${open ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-300"}`}
      >
        <span className={label ? "font-medium text-slate-800" : "text-slate-400"}>{label || placeholder}</span>
        {clearable && label && (
          <span
            role="button"
            aria-label="Сбросить период"
            onClick={(e) => {
              e.stopPropagation();
              apply("", "");
            }}
            className="rounded p-0.5 text-slate-400 hover:text-slate-700"
          >
            <X size={14} />
          </span>
        )}
      </button>
      {open && (
        <div className={`absolute ${alignRight ? "right-0" : "left-0"} z-30 mt-1 flex max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:flex-row`}>
          <ul className="flex shrink-0 flex-wrap gap-1 border-b border-slate-100 p-2 text-sm sm:block sm:w-40 sm:border-r sm:border-b-0">
            {list.map((p) => {
              const [x, y] = p.range();
              const active = iso(x) === a && iso(y) === b;
              return (
                <li key={p.key}>
                  <button type="button" onClick={() => apply(iso(x), iso(y))} className={`w-full rounded-md px-2 py-1 text-left ${active ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
                    {p.label}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="p-3">
            <div className="mb-2 flex items-center justify-between text-sm font-medium text-slate-700">
              <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} className="rounded p-1 hover:bg-slate-100" aria-label="Раньше">
                <ChevronLeft size={16} />
              </button>
              <div className="flex flex-1 justify-around">
                <span>
                  {MONTHS[view.getMonth()]} {view.getFullYear()}
                </span>
                <span className="hidden sm:inline">
                  {MONTHS[second.getMonth()]} {second.getFullYear()}
                </span>
              </div>
              <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} className="rounded p-1 hover:bg-slate-100" aria-label="Позже">
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="flex gap-4">
              <Month base={view} from={fromD} to={toD} hover={hover} onPick={pick} onHover={setHover} />
              <div className="hidden sm:block">
                <Month base={second} from={fromD} to={toD} hover={hover} onPick={pick} onHover={setHover} />
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-400">{picking ? "Выберите вторую дату" : "Нажмите на первую и последнюю дату периода"}</div>
          </div>
        </div>
      )}
    </div>
  );
}
