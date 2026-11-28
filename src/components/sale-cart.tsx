"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Minus, Percent, Plus, Search, Trash2, X } from "lucide-react";
import { inputCls } from "./ui";

type P = {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  minPrice: number | null;
  qty: number;
  other: number;
  barcode: string | null;
  groupId: string | null;
  prices?: Record<string, number>;
  isService?: boolean;
};
type G = { id: string; label: string; ids?: string[] };
type Mode = "%" | "₽";
type Row = { productId: string; qty: number; price: string; disc: string; mode: Mode; discOpen?: boolean };

const fmt = (rub: number) => rub.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₽";
const num = (s: string) => Number(s.replace(",", ".").replace(/\s/g, "") || 0);
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Скидка в рублях: из процента от суммы или из рублей, не больше суммы. */
function discRub(sum: number, value: string, mode: Mode) {
  const v = Math.max(0, num(value));
  return Math.min(sum, round2(mode === "%" ? (sum * Math.min(v, 100)) / 100 : v));
}

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex shrink-0 overflow-hidden rounded-md border border-slate-300 text-xs">
      {(["%", "₽"] as const).map((m) => (
        <button key={m} type="button" onClick={() => onChange(m)} className={`px-2 py-1 ${mode === m ? "bg-blue-600 font-semibold text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>
          {m}
        </button>
      ))}
    </div>
  );
}

/**
 * Экран продажи как в LiveSklad: товары и работы слева, чек справа, плитки снизу.
 * На компьютере занимает ровно экран: прокручиваются только список товаров и позиции чека.
 * Отправляет items (с ценой и скидкой на позицию), discount (скидка на чек, ₽), клиента и оплату.
 */
export function SaleCart({
  products,
  groups,
  children,
  priceOptions = [],
  defaultPriceKey = "retail",
  bonus,
  lookup,
  tiles,
  tilesHref,
  maxDiscountPct = null,
}: {
  tiles?: { priority: (string | null)[]; frequent: ({ id: string; pinned: boolean } | null)[] };
  tilesHref?: string;
  bonus?: { maxPct: number } | null;
  lookup?: (phone: string) => Promise<{ name: string; available: number; visits: number } | null>;
  products: P[];
  groups: G[];
  children?: React.ReactNode;
  priceOptions?: { key: string; name: string }[];
  defaultPriceKey?: string;
  maxDiscountPct?: number | null;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [pk, setPk] = useState(defaultPriceKey);
  const priceFor = (p: P, key = pk) => p.prices?.[key] ?? p.price;
  const [q, setQ] = useState("");
  const [g, setG] = useState("");
  const [kind, setKind] = useState<"" | "goods" | "works">("");
  const [discount, setDiscount] = useState("");
  const [discMode, setDiscMode] = useState<Mode>("%");
  const [phone, setPhone] = useState("");
  const [bonusPay, setBonusPay] = useState("");
  const [method, setMethod] = useState("CASH");
  const [flash, setFlash] = useState<{ id: string; n: number } | null>(null);
  const [info, setInfo] = useState<{ name: string; available: number; visits: number } | null | "none">(null);
  const [checking, startCheck] = useTransition();
  const itemsBox = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const hasWorks = products.some((p) => p.isService);
  const needle = q.trim().toLowerCase();
  const list = products
    .filter(
      (p) =>
        (!kind || (kind === "works") === !!p.isService) &&
        (!g || (groups.find((x) => x.id === g)?.ids ?? [g]).includes(p.groupId ?? "")) &&
        (!needle || p.barcode === q.trim() || p.sku?.toLowerCase() === needle || p.name.toLowerCase().includes(needle)),
    )
    .slice(0, 300);
  const can = (p: P) => p.isService || p.qty > 0;
  const limit = (p: P) => (p.isService ? 9999 : p.qty);

  // новая позиция подсвечивается и прокручивается в зону видимости
  useEffect(() => {
    if (!flash) return;
    itemsBox.current?.querySelector(`[data-row="${flash.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [flash]);

  const add = (p: P, clear = false) => {
    if (!can(p)) return;
    setRows((r) => {
      const ex = r.find((x) => x.productId === p.id);
      if (ex) return r.map((x) => (x.productId === p.id ? { ...x, qty: Math.min(x.qty + 1, limit(p)) } : x));
      return [...r, { productId: p.id, qty: 1, price: String(priceFor(p) / 100), disc: "", mode: "%" }];
    });
    setFlash({ id: p.id, n: Date.now() });
    // поиск остаётся, пока человек сам его не очистит; сканер штрихкода очищает сам
    if (clear) setQ("");
  };
  const upd = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const lines = rows.map((r) => {
    const p = byId.get(r.productId)!;
    const gross = round2(r.qty * num(r.price));
    const d = discRub(gross, r.disc, r.mode);
    const unit = r.qty ? (gross - d) / r.qty : 0;
    return { r, p, gross, d, net: round2(gross - d), below: p.minPrice != null && Math.round(unit * 100) < p.minPrice };
  });
  const gross = round2(lines.reduce((s, l) => s + l.gross, 0));
  const lineDisc = round2(lines.reduce((s, l) => s + l.d, 0));
  const sub = round2(gross - lineDisc);
  const checkDisc = discRub(sub, discount, discMode);
  const total = round2(sub - checkDisc);
  const allDisc = round2(lineDisc + checkDisc);
  const discPct = gross > 0 ? (allDisc / gross) * 100 : 0;
  const overLimit = maxDiscountPct != null && allDisc > 0 && discPct > maxDiscountPct + 1e-9;
  const bonusMax = bonus && info && info !== "none" ? Math.min(info.available / 100, Math.floor(total * bonus.maxPct) / 10000) : 0;
  const bp = Math.min(num(bonusPay), bonusMax);
  const count = rows.reduce((s, r) => s + r.qty, 0);

  const tileSets = tiles
    ? ([
        ["Продать в первую очередь", tiles.priority.map((id) => (id ? { id, pinned: true } : null)), "border-amber-300 bg-amber-50 hover:border-amber-400 hover:bg-amber-100", "text-amber-700"],
        ["Часто продаём", tiles.frequent, "border-sky-200 bg-sky-50 hover:border-sky-400 hover:bg-sky-100", "text-sky-700"],
      ] as const)
    : [];

  return (
    <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1fr)_420px]">
      {/* ---------- товары и работы ---------- */}
      <div className="flex min-h-0 min-w-0 flex-col rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-2.5">
          <div className="relative min-w-[200px] flex-1">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input
              className={`${inputCls} pl-9`}
              placeholder="Название, код или штрихкод сканером (Enter)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const first = list.find(can);
                  if (first) add(first, first.barcode === q.trim() || first.sku === q.trim());
                }
              }}
              autoFocus
            />
            {q && (
              <button type="button" onClick={() => setQ("")} className="absolute top-2 right-2 z-20 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Очистить поиск" title="Очистить поиск">
                <X size={14} />
              </button>
            )}
          </div>
          {priceOptions.length > 1 && (
            <select
              className={`${inputCls} sm:w-44`}
              value={pk}
              title="Какую цену ставить"
              onChange={(e) => {
                const key = e.target.value;
                setPk(key);
                setRows((rs) =>
                  rs.map((r) => {
                    const p = byId.get(r.productId);
                    return p ? { ...r, price: String(priceFor(p, key) / 100) } : r;
                  }),
                );
              }}
            >
              {priceOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  Цена: {o.name}
                </option>
              ))}
            </select>
          )}
          {groups.length > 0 && (
            <select className={`${inputCls} sm:w-44`} value={g} onChange={(e) => setG(e.target.value)}>
              <option value="">Все группы</option>
              {groups.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-1 border-b border-slate-100 px-2.5 py-1.5 text-sm">
          {(
            [
              ["", "Всё"],
              ["goods", "Товары"],
              ["works", "Работы и услуги"],
            ] as const
          )
            .filter(([k]) => k !== "works" || hasWorks)
            .map(([k, l]) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-md px-2.5 py-1 ${kind === k ? "bg-blue-600 font-medium text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                {l}
              </button>
            ))}
          <span className="ml-auto text-xs text-slate-400">Наименований: {list.length}</span>
        </div>
        <div className="scroll-thin max-h-[50vh] min-h-0 flex-1 overflow-auto lg:max-h-none">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Наименование</th>
                <th className="px-3 py-2 text-right font-medium">Кол-во</th>
                <th className="px-3 py-2 text-right font-medium">Др. точки</th>
                <th className="px-3 py-2 text-right font-medium">Цена</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((p) => {
                const inCart = rows.find((r) => r.productId === p.id)?.qty ?? 0;
                return (
                  <tr key={p.id} onClick={() => add(p)} className={can(p) ? `cursor-pointer hover:bg-blue-50 ${inCart ? "bg-blue-50/60" : ""}` : "opacity-50"}>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2 text-slate-900">
                        {p.isService && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 uppercase">услуга</span>}
                        <span>{p.name}</span>
                        {inCart > 0 && <span className="rounded-full bg-blue-600 px-1.5 text-[11px] font-bold text-white">{inCart}</span>}
                      </div>
                      {p.sku && <div className="text-xs text-slate-500">Код: {p.sku}</div>}
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium text-slate-800">{p.isService ? <span className="text-slate-400">—</span> : p.qty}</td>
                    <td className="px-3 py-1.5 text-right text-slate-500">{p.isService ? "" : p.other || ""}</td>
                    <td className="px-3 py-1.5 text-right font-medium whitespace-nowrap text-blue-600">{fmt(priceFor(p) / 100)}</td>
                  </tr>
                );
              })}
              {!list.length && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-400">
                    Ничего не найдено
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- чек ---------- */}
      <div className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white lg:row-span-2">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <span className="text-sm font-semibold tracking-wide text-blue-600 uppercase">
            Чек {rows.length > 0 && <span className="ml-1 rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white normal-case">{count} шт.</span>}
          </span>
          {rows.length > 0 && (
            <button type="button" onClick={() => setRows([])} className="text-xs text-slate-400 hover:text-red-600">
              Очистить чек
            </button>
          )}
        </div>
        <input type="hidden" name="items" value={JSON.stringify(lines.map((l) => ({ productId: l.r.productId, qty: l.r.qty, price: l.r.price, discount: l.d ? String(l.d) : "" })))} />
        <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-2.5">
          <input
            name="clientPhone"
            className={inputCls}
            placeholder="Телефон клиента"
            type="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setInfo(null);
              setBonusPay("");
            }}
          />
          <input name="clientName" className={inputCls} placeholder={info && info !== "none" ? info.name : "Имя клиента"} />
          {bonus && lookup && phone.replace(/\D/g, "").length >= 10 && (
            <div className="col-span-2 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-sm">
              {info === null && <span className="text-slate-500">Бонусы клиента</span>}
              {info === "none" && <span className="text-slate-500">Новый клиент, баллы начислятся после покупки</span>}
              {info && info !== "none" && (
                <span>
                  <b>{info.name}</b> · доступно <b>{(info.available / 100).toLocaleString("ru-RU")}</b> баллов
                </span>
              )}
              <button
                type="button"
                disabled={checking}
                onClick={() => startCheck(async () => setInfo((await lookup(phone)) ?? "none"))}
                className="shrink-0 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs text-amber-800 disabled:opacity-40"
              >
                {checking ? "…" : "Проверить баллы"}
              </button>
            </div>
          )}
        </div>

        <div ref={itemsBox} className="scroll-thin min-h-[140px] flex-1 space-y-2 overflow-y-auto bg-slate-50 p-2.5">
          {lines.map(({ r, p, gross: lg, d, net, below }, i) => {
            const isNew = flash?.id === r.productId;
            return (
              <div
                key={r.productId}
                data-row={r.productId}
                className={`rounded-lg border bg-white p-2.5 shadow-sm transition-colors duration-700 ${isNew ? "border-emerald-400 ring-2 ring-emerald-300" : below ? "border-red-300" : "border-slate-200"}`}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-500">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm leading-snug font-medium text-slate-900">
                      {p.isService && <span className="mr-1.5 rounded bg-violet-100 px-1 py-0.5 align-middle text-[10px] font-semibold text-violet-700 uppercase">услуга</span>}
                      {p.name}
                    </div>
                    {isNew && <div className="text-[11px] font-medium text-emerald-600">добавлено</div>}
                  </div>
                  <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Убрать из чека" title="Убрать из чека">
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-1.5 pl-7">
                  <button type="button" className="rounded-md border border-slate-200 p-1 hover:bg-slate-100" onClick={() => upd(i, { qty: Math.max(1, r.qty - 1) })} aria-label="Меньше">
                    <Minus size={13} />
                  </button>
                  <span className="w-7 text-center text-sm font-semibold">{r.qty}</span>
                  <button type="button" className="rounded-md border border-slate-200 p-1 hover:bg-slate-100" onClick={() => upd(i, { qty: Math.min(limit(p), r.qty + 1) })} aria-label="Больше">
                    <Plus size={13} />
                  </button>
                  <span className="px-0.5 text-xs text-slate-400">×</span>
                  <input className={`${inputCls} w-24 py-1 text-right ${below ? "border-red-500" : ""}`} inputMode="decimal" value={r.price} onChange={(e) => upd(i, { price: e.target.value })} aria-label="Цена за шт" />
                  <button
                    type="button"
                    onClick={() => upd(i, { discOpen: !r.discOpen })}
                    className={`ml-1 flex items-center gap-0.5 rounded-md border px-1.5 py-1 text-xs ${d ? "border-emerald-300 bg-emerald-50 font-semibold text-emerald-700" : "border-slate-200 text-slate-500 hover:bg-slate-100"}`}
                    title="Скидка на позицию"
                  >
                    <Percent size={12} /> {d ? `−${fmt(d)}` : "скидка"}
                  </button>
                  <span className="ml-auto text-right leading-tight whitespace-nowrap">
                    {d > 0 && <span className="block text-xs text-slate-400 line-through">{fmt(lg)}</span>}
                    <b className="text-sm text-slate-900">{fmt(net)}</b>
                  </span>
                </div>
                {r.discOpen && (
                  <div className="mt-2 flex items-center gap-2 pl-7 text-xs text-slate-500">
                    <span>Скидка</span>
                    <input className={`${inputCls} w-20 py-1`} inputMode="decimal" value={r.disc} onChange={(e) => upd(i, { disc: e.target.value })} placeholder="0" autoFocus />
                    <ModeSwitch mode={r.mode} onChange={(m) => upd(i, { mode: m })} />
                    {[5, 10].map((v) => (
                      <button key={v} type="button" onClick={() => upd(i, { disc: String(v), mode: "%" })} className="rounded border border-slate-200 px-1.5 py-0.5 hover:bg-slate-100">
                        {v}%
                      </button>
                    ))}
                    {r.disc && (
                      <button type="button" onClick={() => upd(i, { disc: "", discOpen: false })} className="text-slate-400 hover:text-red-600">
                        убрать
                      </button>
                    )}
                  </div>
                )}
                {below && <div className="mt-1 pl-7 text-xs text-red-600">Цена со скидкой ниже минимальной {fmt((p.minPrice ?? 0) / 100)}</div>}
              </div>
            );
          })}
          {!rows.length && <p className="py-8 text-center text-sm text-slate-400">Выберите товары слева, нажмите на плитку или отсканируйте штрихкод</p>}
        </div>

        <div className="space-y-2 border-t border-slate-200 p-3">
          <div className="space-y-0.5 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Сумма позиций</span>
              <span>{fmt(gross)}</span>
            </div>
            {lineDisc > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Скидки на позиции</span>
                <span>−{fmt(lineDisc)}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="whitespace-nowrap text-slate-600">Скидка на чек</span>
            <input className={`${inputCls} w-20 py-1`} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
            <ModeSwitch mode={discMode} onChange={setDiscMode} />
            {checkDisc > 0 && <span className="ml-auto font-medium whitespace-nowrap text-emerald-700">−{fmt(checkDisc)}</span>}
          </div>
          <input type="hidden" name="discount" value={checkDisc || ""} />
          {overLimit && (
            <div className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
              Скидка {discPct.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}% больше разрешённой для вашей должности ({maxDiscountPct}%)
            </div>
          )}
          {bonusMax > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <button type="button" onClick={() => setBonusPay(String(bonusMax))} className="whitespace-nowrap text-amber-700 hover:underline" title="Списать максимум">
                Баллами (до {bonusMax.toLocaleString("ru-RU")})
              </button>
              <input className={`${inputCls} ml-auto w-24 py-1`} inputMode="decimal" value={bonusPay} onChange={(e) => setBonusPay(e.target.value)} />
            </div>
          )}
          <input type="hidden" name="bonusPay" value={bp || ""} />
          <div className="flex items-end justify-between rounded-lg bg-blue-600 px-3 py-2 text-white">
            <span className="text-sm">
              {bp ? "К оплате деньгами" : "Итого"}
              {allDisc > 0 && <span className="block text-xs text-blue-100">скидка {fmt(allDisc)} ({discPct.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%)</span>}
            </span>
            <span className="text-2xl font-bold">{fmt(round2(total - bp))}</span>
          </div>
          <input type="hidden" name="method" value={method} />
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            {(
              [
                ["CASH", "Наличные"],
                ["CARD", "Карта"],
                ["TRANSFER", "Перевод"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setMethod(k)} className={`rounded-md py-1.5 ${method === k ? "bg-white font-semibold text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
                {l}
              </button>
            ))}
          </div>
          {children}
        </div>
      </div>

      {/* ---------- плитки ---------- */}
      {tiles && (
        <div className="grid gap-3 2xl:grid-cols-2">
          {tileSets.map(([title, tl, cls, tcls]) => (
            <div key={title} className="rounded-xl border border-slate-200 bg-white px-2.5 py-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className={`text-xs font-semibold tracking-wide uppercase ${tcls}`}>{title}</span>
                {tilesHref && (
                  <a href={tilesHref} className="text-xs text-slate-400 hover:text-blue-600">
                    настроить
                  </a>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {tl.map((t, i) => {
                  const p = t ? byId.get(t.id) : undefined;
                  if (!p)
                    return (
                      <div key={i} className="flex h-16 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-300">
                        {t ? "нет в наличии" : "пусто"}
                      </div>
                    );
                  const inCart = rows.find((r) => r.productId === p.id)?.qty ?? 0;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={!can(p)}
                      onClick={() => add(p)}
                      title={p.name}
                      className={`relative flex h-16 flex-col justify-between rounded-lg border px-2 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}
                    >
                      <span className="line-clamp-2 text-xs leading-tight font-medium text-slate-800">{p.name}</span>
                      <span className="flex items-end justify-between gap-1">
                        <b className="text-sm text-slate-900">{fmt(priceFor(p) / 100)}</b>
                        <span className="text-[11px] text-slate-500">{p.isService ? "услуга" : `${p.qty} шт.`}</span>
                      </span>
                      {inCart > 0 && <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[11px] font-bold text-white">{inCart}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
