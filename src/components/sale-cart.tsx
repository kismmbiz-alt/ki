"use client";

import { useMemo, useState, useTransition } from "react";
import { Minus, Plus, Search, Trash2, X } from "lucide-react";
import { inputCls } from "./ui";

type P = { id: string; name: string; sku: string | null; price: number; minPrice: number | null; qty: number; other: number; barcode: string | null; groupId: string | null; prices?: Record<string, number> };
type G = { id: string; label: string; ids?: string[] };

const fmt = (rub: number) => rub.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₽";

/** Экран продажи: список товаров слева, чек справа. Отправляет items, discount, клиент. */
export function SaleCart({
  products,
  groups,
  children,
  priceOptions = [],
  defaultPriceKey = "retail",
  bonus,
  lookup,
}: {
  bonus?: { maxPct: number } | null;
  lookup?: (phone: string) => Promise<{ name: string; available: number; visits: number } | null>;
  products: P[];
  groups: G[];
  children?: React.ReactNode;
  priceOptions?: { key: string; name: string }[];
  defaultPriceKey?: string;
}) {
  const [rows, setRows] = useState<{ productId: string; qty: number; price: string }[]>([]);
  const [pk, setPk] = useState(defaultPriceKey);
  const priceFor = (p: P, key = pk) => p.prices?.[key] ?? p.price;
  const [q, setQ] = useState("");
  const [g, setG] = useState("");
  const [discount, setDiscount] = useState("");
  const [phone, setPhone] = useState("");
  const [bonusPay, setBonusPay] = useState("");
  const [info, setInfo] = useState<{ name: string; available: number; visits: number } | null | "none">(null);
  const [checking, startCheck] = useTransition();
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const needle = q.trim().toLowerCase();
  const list = products
    .filter((p) => (!g || (groups.find((x) => x.id === g)?.ids ?? [g]).includes(p.groupId ?? "")) && (!needle || p.barcode === q.trim() || p.sku?.toLowerCase() === needle || p.name.toLowerCase().includes(needle)))
    .slice(0, 200);

  const add = (p: P, clear = false) => {
    setRows((r) => {
      const ex = r.find((x) => x.productId === p.id);
      if (ex) return r.map((x) => (x.productId === p.id ? { ...x, qty: Math.min(x.qty + 1, p.qty) } : x));
      return [...r, { productId: p.id, qty: 1, price: String(priceFor(p) / 100) }];
    });
    // поиск остаётся, пока человек сам его не очистит; сканер штрихкода очищает сам
    if (clear) setQ("");
  };
  const num = (s: string) => Number(s.replace(",", ".").replace(/\s/g, "") || 0);
  const sum = rows.reduce((s, r) => s + r.qty * num(r.price), 0);
  const disc = Math.min(num(discount), sum);
  const total = sum - disc;
  const bonusMax = bonus && info && info !== "none" ? Math.min(info.available / 100, Math.floor(total * bonus.maxPct) / 10000) : 0;
  const bp = Math.min(num(bonusPay), bonusMax);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
      <div className="min-w-0 rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input
              className={`${inputCls} pl-9`}
              placeholder="Название, код или штрихкод сканером (Enter)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (list[0]) add(list[0], list[0].barcode === q.trim() || list[0].sku === q.trim());
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
              className={`${inputCls} sm:w-48`}
              value={pk}
              title="Какую цену ставить"
              onChange={(e) => {
                const key = e.target.value;
                setPk(key);
                setRows((rs) => rs.map((r) => {
                  const p = byId.get(r.productId);
                  return p ? { ...r, price: String(priceFor(p, key) / 100) } : r;
                }));
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
            <select className={`${inputCls} sm:w-56`} value={g} onChange={(e) => setG(e.target.value)}>
              <option value="">Все группы</option>
              {groups.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="scroll-thin max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Наименование</th>
                <th className="px-3 py-2 text-right font-medium">Кол-во</th>
                <th className="px-3 py-2 text-right font-medium">Др. точки</th>
                <th className="px-3 py-2 text-right font-medium">Цена</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((p) => (
                <tr key={p.id} onClick={() => p.qty > 0 && add(p)} className={p.qty > 0 ? "cursor-pointer hover:bg-slate-100/60" : "opacity-50"}>
                  <td className="px-3 py-2">
                    <div className="text-slate-900">{p.name}</div>
                    {p.sku && <div className="text-xs text-slate-500">Код: {p.sku}</div>}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-slate-800">{p.qty}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{p.other || ""}</td>
                  <td className="px-3 py-2 text-right text-blue-600">{fmt(priceFor(p) / 100)}</td>
                </tr>
              ))}
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

      <div className="flex flex-col rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3 text-xs font-semibold tracking-wide text-blue-600 uppercase">Чек</div>
        <input type="hidden" name="items" value={JSON.stringify(rows.map((r) => ({ ...r, price: r.price })))} />
        <div className="grid grid-cols-2 gap-2 p-3">
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
          {bonus && lookup && (
            <div className="col-span-2 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm">
              {info === null && <span className="text-slate-500">Бонусы клиента</span>}
              {info === "none" && <span className="text-slate-500">Новый клиент, баллы начислятся после покупки</span>}
              {info && info !== "none" && (
                <span>
                  <b>{info.name}</b> · доступно <b>{(info.available / 100).toLocaleString("ru-RU")}</b> баллов · визитов {info.visits}
                </span>
              )}
              <button
                type="button"
                disabled={phone.replace(/\D/g, "").length < 10 || checking}
                onClick={() => startCheck(async () => setInfo((await lookup(phone)) ?? "none"))}
                className="shrink-0 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs text-amber-800 disabled:opacity-40"
              >
                {checking ? "…" : "Проверить баллы"}
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 divide-y divide-slate-100 px-3">
          {rows.map((r, i) => {
            const p = byId.get(r.productId)!;
            const below = p.minPrice != null && num(r.price) * 100 < p.minPrice;
            return (
              <div key={r.productId} className="py-2">
                <div className="flex items-start justify-between gap-2 text-sm">
                  <span className="text-slate-800">{p.name}</span>
                  <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600" aria-label="Убрать">
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <button type="button" className="rounded-md border border-slate-200 p-1" onClick={() => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))} aria-label="Меньше">
                    <Minus size={14} />
                  </button>
                  <span className="w-8 text-center text-sm">{r.qty}</span>
                  <button type="button" className="rounded-md border border-slate-200 p-1" onClick={() => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, qty: Math.min(p.qty, x.qty + 1) } : x)))} aria-label="Больше">
                    <Plus size={14} />
                  </button>
                  <span className="text-xs text-slate-400">×</span>
                  <div className="w-24 shrink-0">
                    <input
                      className={`${inputCls} py-1 ${below ? "border-red-500" : ""}`}
                      inputMode="decimal"
                      value={r.price}
                      onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                    />
                  </div>
                  <span className="ml-auto text-sm font-medium whitespace-nowrap text-slate-900">{fmt(r.qty * num(r.price))}</span>
                </div>
                {below && <div className="mt-1 text-xs text-red-600">Ниже минимальной цены {fmt((p.minPrice ?? 0) / 100)}</div>}
              </div>
            );
          })}
          {!rows.length && <p className="py-8 text-center text-sm text-slate-400">Выберите товары слева или отсканируйте штрихкод</p>}
        </div>
        <div className="space-y-2 border-t border-slate-100 p-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="whitespace-nowrap text-slate-500">Скидка на чек, ₽</span>
            <div className="w-28">
              <input name="discount" className={`${inputCls} py-1`} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </div>
          </div>
          {bonusMax > 0 && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <button type="button" onClick={() => setBonusPay(String(bonusMax))} className="whitespace-nowrap text-amber-700 hover:underline" title="Списать максимум">
                Оплатить баллами (до {bonusMax.toLocaleString("ru-RU")})
              </button>
              <div className="w-28">
                <input className={`${inputCls} py-1`} inputMode="decimal" value={bonusPay} onChange={(e) => setBonusPay(e.target.value)} />
              </div>
            </div>
          )}
          <input type="hidden" name="bonusPay" value={bp || ""} />
          <div className="flex items-center justify-between text-lg font-semibold text-slate-900">
            <span>{bp ? "К оплате деньгами" : "Итого"}</span>
            <span>{fmt(total - bp)}</span>
          </div>
          <select name="method" defaultValue="CASH" className={inputCls}>
            <option value="CASH">Наличные</option>
            <option value="CARD">Карта</option>
            <option value="TRANSFER">Перевод</option>
          </select>
          {children}
        </div>
      </div>
    </div>
  );
}
