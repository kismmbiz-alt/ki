"use client";

import { useMemo, useState } from "react";
import { BookOpen, FileUp, PackagePlus, Plus, Trash2, X } from "lucide-react";
import { inputCls } from "./ui";

type P = { id: string; name: string; sku: string | null; barcode: string | null; groupId: string | null; qty: number; cost: number; price: number; repairPrice: number | null; minPrice: number | null; isSerial?: boolean };
type Opt = { id: string; name: string };
type NewP = { name: string; groupId: string; sku: string; article: string; barcode: string; unit: string; warrantyDays: string; country: string; description: string; isSerial: boolean };
type Row = { key: string; productId?: string; newProduct?: NewP; qty: string; cost: string; price: string; repairPrice: string; minPrice: string; serials?: string };

const rubStr = (k: number | null | undefined) => (k == null ? "" : String(k / 100));
const num = (s: string) => Number(String(s).replace(",", ".").replace(/\s/g, "")) || 0;
const fmt = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₽";
const emptyNew = (name = ""): NewP => ({ name, groupId: "", sku: "", article: "", barcode: "", unit: "шт", warrantyDays: "", country: "", description: "", isSerial: false });

/** Строки из Excel (вставка) или CSV: код/штрихкод/название; кол-во; закупка; розничная. */
export function parseImport(text: string) {
  const out: { key: string; qty: string; cost: string; price: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const sep = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
    const [key = "", qty = "1", cost = "", price = ""] = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (!key || /^(наимен|назван|товар|код|артикул|штрих)/i.test(key)) continue;
    out.push({ key, qty: qty.replace(/\s/g, "") || "1", cost: cost.replace(/\s|₽/g, ""), price: price.replace(/\s|₽/g, "") });
  }
  return out;
}

const Lbl = ({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) => (
  <label className={`block text-xs text-slate-500 ${className}`}>
    <span className="mb-1 block">{label}</span>
    {children}
  </label>
);

/** Поступление как в LiveSklad: от кого, на какой склад, ответственный, товары с ценами, новая карточка товара, оплата. */
export function ReceiptForm({
  products,
  groups,
  warehouses,
  suppliers,
  users,
  cashboxes,
  defaults,
  canPay,
  showCost,
}: {
  products: P[];
  groups: { id: string; label: string; ids: string[] }[];
  warehouses: Opt[];
  suppliers: Opt[];
  users: Opt[];
  cashboxes: Opt[];
  defaults: { warehouseId: string; userId: string; cashboxId?: string; supplierId?: string };
  canPay: boolean;
  showCost: boolean;
}) {
  const [source, setSource] = useState<"supplier" | "client">("supplier");
  const [supplierId, setSupplierId] = useState(defaults.supplierId ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [card, setCard] = useState<(NewP & { qty: string; cost: string; price: string; repairPrice: string; minPrice: string }) | null>(null);
  const [dict, setDict] = useState<string | null>(null);
  const [pay, setPay] = useState("");
  const [imp, setImp] = useState<string | null>(null);
  const [impNote, setImpNote] = useState("");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const needle = q.trim().toLowerCase();
  const found = needle ? products.filter((p) => p.barcode === q.trim() || p.sku?.toLowerCase() === needle || p.name.toLowerCase().includes(needle)).slice(0, 10) : [];

  const addProduct = (p: P) => {
    setRows((r) =>
      r.some((x) => x.productId === p.id)
        ? r.map((x) => (x.productId === p.id ? { ...x, qty: String(num(x.qty) + 1) } : x))
        : [...r, { key: p.id, productId: p.id, qty: "1", cost: rubStr(p.cost), price: rubStr(p.price), repairPrice: rubStr(p.repairPrice), minPrice: rubStr(p.minPrice) }],
    );
    setQ("");
  };
  const set = (i: number, k: keyof Row, v: string) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const total = rows.reduce((s, r) => s + num(r.qty) * num(r.cost), 0);
  const dictGroup = groups.find((g) => g.id === dict);
  const dictList = dict === null ? [] : products.filter((p) => (dict === "" ? true : dict === "none" ? !p.groupId : dictGroup?.ids.includes(p.groupId ?? ""))).slice(0, 200);

  const payload = rows.map(({ key: _k, ...r }) => r);
  const serialOf = (r: Row) => (r.productId ? byId.get(r.productId)?.isSerial : r.newProduct?.isSerial) ?? false;
  const snCount = (v?: string) => new Set((v ?? "").split(/[\s,;]+/).filter(Boolean)).size;

  const runImport = () => {
    const lines = parseImport(imp ?? "");
    let found = 0;
    let created = 0;
    const next = [...rows];
    for (const l of lines) {
      const k = l.key.toLowerCase();
      const p = products.find((x) => x.barcode === l.key || x.sku?.toLowerCase() === k) ?? products.find((x) => x.name.toLowerCase() === k);
      if (p) {
        found++;
        const at = next.findIndex((x) => x.productId === p.id);
        if (at >= 0) next[at] = { ...next[at], qty: String(num(next[at].qty) + num(l.qty)) };
        else next.push({ key: p.id, productId: p.id, qty: l.qty, cost: l.cost || rubStr(p.cost), price: l.price || rubStr(p.price), repairPrice: rubStr(p.repairPrice), minPrice: rubStr(p.minPrice) });
      } else {
        created++;
        next.push({ key: `imp-${Date.now()}-${next.length}`, newProduct: emptyNew(l.key), qty: l.qty, cost: l.cost, price: l.price, repairPrice: "", minPrice: "" });
      }
    }
    setRows(next);
    setImpNote(lines.length ? `Добавлено строк: ${lines.length}. Нашлось в справочнике: ${found}, новых карточек: ${created}.` : "Не нашёл строк. Нужны колонки: название или код, количество, закупка, розничная.");
    if (lines.length) setImp(null);
  };
  const set2 = <K extends keyof NonNullable<typeof card>>(k: K, v: NonNullable<typeof card>[K]) => setCard((c) => (c ? { ...c, [k]: v } : c));

  return (
    <div className="space-y-4">
      <input type="hidden" name="items" value={JSON.stringify(payload)} />
      <input type="hidden" name="source" value={source} />

      {/* Шапка документа */}
      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            {(
              [
                ["supplier", "От поставщика"],
                ["client", "От клиента (принёс технику)"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setSource(k)} className={`flex-1 rounded-md px-3 py-1.5 ${source === k ? "bg-white font-medium text-slate-900 shadow" : "text-slate-600"}`}>
                {l}
              </button>
            ))}
          </div>
          {source === "supplier" ? (
            <div className="grid grid-cols-2 gap-2">
              <Lbl label="Поставщик">
                <select name="supplierId" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputCls}>
                  <option value="">— выбрать —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Lbl>
              {!supplierId && (
                <Lbl label="или новый поставщик">
                  <input name="newSupplier" className={inputCls} placeholder="Название" />
                </Lbl>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Lbl label="Телефон клиента *">
                <input name="clientPhone" className={inputCls} inputMode="tel" placeholder="8 900 000-00-00" required />
              </Lbl>
              <Lbl label="ФИО клиента">
                <input name="clientName" className={inputCls} placeholder="Найдём по телефону или создадим" />
              </Lbl>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Lbl label="Склад *">
              <select name="warehouseId" defaultValue={defaults.warehouseId} className={inputCls} required>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </Lbl>
            <Lbl label="Ответственный">
              <select name="responsibleId" defaultValue={defaults.userId} className={inputCls}>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Lbl>
          </div>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Lbl label="Входящий документ №">
              <input name="inDocNo" className={inputCls} placeholder="№ накладной" />
            </Lbl>
            <Lbl label="от">
              <input name="inDocDate" type="date" className={inputCls} />
            </Lbl>
          </div>
          <Lbl label="Примечание">
            <textarea name="comment" rows={3} className={inputCls} />
          </Lbl>
        </div>
      </div>

      {/* Товары */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-64 flex-1">
            <input
              className={inputCls}
              placeholder="Добавить товар: название, код или штрихкод"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (found[0]) addProduct(found[0]);
                  else if (q.trim()) setCard({ ...emptyNew(q.trim()), qty: "1", cost: "", price: "", repairPrice: "", minPrice: "" });
                }
              }}
            />
            {needle && (
              <ul className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {found.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => addProduct(p)} className="flex w-full justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-100">
                      <span className="text-slate-800">{p.name}</span>
                      <span className="shrink-0 text-slate-500">{p.qty} шт.</span>
                    </button>
                  </li>
                ))}
                {!found.length && <li className="px-3 py-2 text-sm text-slate-400">Нет такого товара</li>}
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setCard({ ...emptyNew(q.trim()), qty: "1", cost: "", price: "", repairPrice: "", minPrice: "" });
                      setQ("");
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-slate-100"
                  >
                    + Создать новый товар «{q.trim()}»
                  </button>
                </li>
              </ul>
            )}
          </div>
          <button type="button" onClick={() => setCard({ ...emptyNew(), qty: "1", cost: "", price: "", repairPrice: "", minPrice: "" })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
            <PackagePlus size={16} /> Новый товар
          </button>
          <button type="button" onClick={() => setDict(dict === null ? "" : null)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
            <BookOpen size={16} /> Из справочника
          </button>
          <button type="button" onClick={() => setImp(imp === null ? "" : null)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
            <FileUp size={16} /> Из файла
          </button>
        </div>
        {impNote && imp === null && <p className="mb-3 text-sm text-emerald-700">{impNote}</p>}

        {/* Загрузка строк из Excel/CSV */}
        {imp !== null && (
          <div className="mb-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <b className="text-slate-800">Загрузить товары из файла</b>
              <button type="button" onClick={() => setImp(null)} className="rounded p-1 text-slate-400 hover:text-slate-700" aria-label="Закрыть">
                <X size={16} />
              </button>
            </div>
            <p className="text-slate-500">
              Колонки по порядку: <b>название, код или штрихкод</b> · <b>количество</b> · <b>закупочная цена</b> · <b>розничная цена</b>. Выделите строки в Excel, скопируйте и вставьте сюда, или выберите файл CSV. Товары, которых нет в справочнике, станут новыми карточками.
            </p>
            <input
              type="file"
              accept=".csv,.txt,text/csv"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setImp(await f.text());
              }}
              className="block text-xs"
            />
            <textarea value={imp} onChange={(e) => setImp(e.target.value)} rows={6} className={inputCls} placeholder={"iPhone 13 дисплей\t2\t3500\t6900\nАКБ Samsung A51\t5\t800\t1990"} />
            {impNote && <p className="text-amber-700">{impNote}</p>}
            <button type="button" onClick={runImport} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Добавить строки
            </button>
          </div>
        )}

        {/* Справочник товаров по группам */}
        {dict !== null && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center gap-2">
              <select value={dict} onChange={(e) => setDict(e.target.value)} className={`${inputCls} max-w-72`}>
                <option value="">Все товары</option>
                <option value="none">Без группы</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-500">{dictList.length} шт., нажмите на товар, чтобы добавить</span>
              <button type="button" onClick={() => setDict(null)} className="ml-auto rounded p-1 text-slate-400 hover:text-slate-700" aria-label="Закрыть справочник">
                <X size={16} />
              </button>
            </div>
            <div className="scroll-thin max-h-64 overflow-y-auto rounded-md bg-white">
              {dictList.map((p) => (
                <button key={p.id} type="button" onClick={() => addProduct(p)} className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-1.5 text-left text-sm hover:bg-blue-50">
                  <span className="text-slate-800">
                    <Plus size={13} className="mr-1 inline text-blue-600" />
                    {p.name}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {p.qty} шт. · {fmt(p.price / 100)}
                  </span>
                </button>
              ))}
              {!dictList.length && <p className="p-4 text-center text-sm text-slate-400">В группе нет товаров</p>}
            </div>
          </div>
        )}

        {/* Новая карточка товара */}
        {card && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">Новая карточка товара</div>
              <button type="button" onClick={() => setCard(null)} className="rounded p-1 text-slate-400 hover:text-slate-700" aria-label="Закрыть">
                <X size={16} />
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Lbl label="Название *" className="sm:col-span-2">
                <input className={inputCls} value={card.name} onChange={(e) => set2("name", e.target.value)} placeholder="iPhone 13 128GB Midnight" autoFocus />
              </Lbl>
              <Lbl label="Группа">
                <select className={inputCls} value={card.groupId} onChange={(e) => set2("groupId", e.target.value)}>
                  <option value="">Без группы</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </Lbl>
              <Lbl label="Код">
                <input className={inputCls} value={card.sku} onChange={(e) => set2("sku", e.target.value)} />
              </Lbl>
              <Lbl label="Артикул">
                <input className={inputCls} value={card.article} onChange={(e) => set2("article", e.target.value)} />
              </Lbl>
              <Lbl label="Штрихкод">
                <input className={inputCls} value={card.barcode} onChange={(e) => set2("barcode", e.target.value)} placeholder="пусто — создадим сами" />
              </Lbl>
              <Lbl label="Ед. измерения">
                <input className={inputCls} value={card.unit} onChange={(e) => set2("unit", e.target.value)} />
              </Lbl>
              <Lbl label="Гарантия, дней">
                <input className={inputCls} inputMode="numeric" value={card.warrantyDays} onChange={(e) => set2("warrantyDays", e.target.value)} />
              </Lbl>
              <Lbl label="Страна">
                <input className={inputCls} value={card.country} onChange={(e) => set2("country", e.target.value)} />
              </Lbl>
              <Lbl label="Характеристики (память, цвет, состояние, комплект…)" className="sm:col-span-2 lg:col-span-3">
                <textarea className={inputCls} rows={2} value={card.description} onChange={(e) => set2("description", e.target.value)} />
              </Lbl>
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
                <input type="checkbox" checked={card.isSerial} onChange={(e) => set2("isSerial", e.target.checked)} /> Серийный товар (IMEI / S/N)
              </label>
              <Lbl label="Кол-во *">
                <input className={inputCls} inputMode="numeric" value={card.qty} onChange={(e) => set2("qty", e.target.value)} />
              </Lbl>
              <Lbl label="Закупочная цена, ₽">
                <input className={inputCls} inputMode="decimal" value={card.cost} onChange={(e) => set2("cost", e.target.value)} />
              </Lbl>
              <Lbl label="Розничная, ₽">
                <input className={inputCls} inputMode="decimal" value={card.price} onChange={(e) => set2("price", e.target.value)} />
              </Lbl>
              <Lbl label="Ремонтная, ₽">
                <input className={inputCls} inputMode="decimal" value={card.repairPrice} onChange={(e) => set2("repairPrice", e.target.value)} />
              </Lbl>
              <Lbl label="Минимальная, ₽">
                <input className={inputCls} inputMode="decimal" value={card.minPrice} onChange={(e) => set2("minPrice", e.target.value)} />
              </Lbl>
            </div>
            <button
              type="button"
              disabled={!card.name.trim() || !(num(card.qty) > 0)}
              onClick={() => {
                const { qty, cost, price, repairPrice, minPrice, ...np } = card;
                setRows((r) => [...r, { key: `new-${Date.now()}`, newProduct: { ...np, name: np.name.trim() }, qty, cost, price, repairPrice, minPrice }]);
                setCard(null);
              }}
              className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Добавить в поступление
            </button>
            <span className="ml-3 text-xs text-slate-500">Карточка сохранится вместе с поступлением.</span>
          </div>
        )}

        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1 font-medium">Товар</th>
                <th className="w-20 py-1 font-medium">Кол-во</th>
                <th className="w-28 py-1 pl-2 font-medium">Закуп. цена</th>
                <th className="w-28 py-1 pl-2 text-right font-medium">Сумма закупа</th>
                <th className="w-28 py-1 pl-2 font-medium">Розничная</th>
                <th className="w-28 py-1 pl-2 font-medium">Ремонтная</th>
                <th className="w-28 py-1 pl-2 font-medium">Минимальная</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => {
                const p = r.productId ? byId.get(r.productId) : undefined;
                return (
                  <tr key={r.key}>
                    <td className="py-2 pr-2">
                      <div className="text-slate-800">{p?.name ?? r.newProduct?.name}</div>
                      <div className="text-xs text-slate-400">{r.newProduct ? <span className="text-blue-600">новая карточка</span> : `на складах ${p?.qty ?? 0} шт.`}</div>
                      {serialOf(r) || r.serials !== undefined ? (
                        <div className="mt-1">
                          <textarea
                            value={r.serials ?? ""}
                            onChange={(e) => set(i, "serials", e.target.value)}
                            rows={Math.min(Math.max(num(r.qty), 1), 4)}
                            placeholder="IMEI / S/N — по одному в строке"
                            className={`${inputCls} font-mono text-xs`}
                          />
                          <div className={`text-xs ${serialOf(r) && snCount(r.serials) !== num(r.qty) ? "text-red-600" : "text-slate-400"}`}>
                            Серийных номеров: {snCount(r.serials)} из {num(r.qty)}
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => set(i, "serials", "")} className="text-xs text-blue-600 hover:underline">
                          + серийные номера
                        </button>
                      )}
                    </td>
                    {(["qty", "cost"] as const).map((k) => (
                      <td key={k} className={k === "qty" ? "py-2" : "py-2 pl-2"}>
                        <input className={inputCls} inputMode="decimal" value={r[k]} onChange={(e) => set(i, k, e.target.value)} />
                      </td>
                    ))}
                    <td className="py-2 pl-2 text-right whitespace-nowrap">{fmt(num(r.qty) * num(r.cost))}</td>
                    {(["price", "repairPrice", "minPrice"] as const).map((k) => (
                      <td key={k} className="py-2 pl-2">
                        <input className={inputCls} inputMode="decimal" value={r[k]} onChange={(e) => set(i, k, e.target.value)} />
                      </td>
                    ))}
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
                  <td colSpan={8} className="py-6 text-center text-slate-400">
                    Найдите товар через поиск, выберите из справочника или создайте новый
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <div className="mt-2 text-right text-sm">
            Итого: <b>{rows.reduce((s, r) => s + num(r.qty), 0)} шт.</b> на <b>{fmt(total)}</b>
            {!showCost && <span className="ml-2 text-xs text-slate-400">(по закупке)</span>}
          </div>
        )}
      </div>

      {/* Оплата */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-sm font-semibold text-slate-800">Оплата {source === "client" ? "клиенту" : "поставщику"}</div>
        {canPay ? (
          <div className="flex flex-wrap items-end gap-2">
            <Lbl label="Сумма, ₽">
              <input name="payAmount" className={`${inputCls} w-40`} inputMode="decimal" value={pay} onChange={(e) => setPay(e.target.value)} placeholder="0 — оплатим позже" />
            </Lbl>
            <button type="button" onClick={() => setPay(String(Math.round(total * 100) / 100))} className="mb-0.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
              Всю сумму
            </button>
            <Lbl label="Касса">
              <select name="cashboxId" defaultValue={defaults.cashboxId} className={`${inputCls} w-48`}>
                {cashboxes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Lbl>
            <Lbl label="Способ">
              <select name="method" defaultValue="CASH" className={`${inputCls} w-36`}>
                <option value="CASH">Наличные</option>
                <option value="CARD">Карта</option>
                <option value="TRANSFER">Перевод</option>
              </select>
            </Lbl>
            {total > 0 && <span className="mb-2 text-sm text-slate-500">Останется долг: {fmt(Math.max(total - num(pay), 0))}</span>}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Оплатить можно позже из документа (нужно право записывать расходы из кассы).</p>
        )}
      </div>
    </div>
  );
}
