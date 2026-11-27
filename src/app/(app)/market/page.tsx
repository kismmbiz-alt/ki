import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { btn, Card, dt, Field, PageHeader, Select, Stat } from "@/components/ui";
import { DeviceChips } from "@/components/market";
import { PriceLine } from "@/components/charts";
import { rub } from "@/lib/money";
import { IPHONE_MODELS, MEMORY_OPTIONS, memoryLabel } from "@/lib/market/device";
import { estimate, MARKET_DAYS, MIN_COUNT, marketTable, priceHistory, suggestedBuyPrice, type Stats } from "@/lib/market/prices";
import { MarketTabs } from "./tabs";

/** Состояние техники и сколько процентов от цены рынка оно обычно «съедает». Ориентир, не точный расчёт. */
const CONDITIONS = [
  { key: "bat", label: "АКБ ниже 80%", pct: 5 },
  { key: "scr", label: "Царапины, потёртости", pct: 5 },
  { key: "chip", label: "Сколы или трещины корпуса", pct: 10 },
  { key: "glass", label: "Разбит экран или задняя крышка", pct: 25 },
  { key: "face", label: "Не работает Face ID", pct: 20 },
  { key: "rep", label: "Менялся экран или АКБ (не оригинал)", pct: 15 },
  { key: "box", label: "Нет коробки и зарядки", pct: 3 },
] as const;

type SP = { model?: string; mem?: string } & Partial<Record<(typeof CONDITIONS)[number]["key"], string>>;

export default async function EstimatePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("buyback");
  const t = { db: ctx.db, companyId: ctx.company.id };
  const margin = ctx.company.marketMargin;
  const model = sp.model && (IPHONE_MODELS as readonly string[]).includes(sp.model) ? sp.model : null;
  const mem = sp.mem && MEMORY_OPTIONS.includes(Number(sp.mem)) ? Number(sp.mem) : null;
  const picked = CONDITIONS.filter((c) => sp[c.key]);

  const [cells, est, history, fresh] = await Promise.all([
    marketTable(t),
    model && mem ? estimate(t, model, mem, ctx.company.avitoRegion) : null,
    model && mem ? priceHistory(t, model, mem, 30) : [],
    model && mem
      ? ctx.db.listing.findMany({ where: { model, memoryGb: mem, price: { not: null } }, orderBy: [{ postedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], take: 8 })
      : [],
  ]);

  const market: Stats | null = est ? (est.listings ?? est.avito.stats ?? est.ownSales) : null;
  const source = est ? (est.listings ? "по собранным объявлениям" : est.avito.stats ? "по Авито прямо сейчас" : est.ownSales ? "по вашим продажам" : "") : "";
  const deductPct = picked.reduce((s, c) => s + c.pct, 0);
  const marketAdj = market ? Math.round((market.median * (100 - deductPct)) / 100) : 0;
  const offer = market ? suggestedBuyPrice(marketAdj, margin) : 0;

  const byKey = new Map(cells.map((c) => [`${c.model}|${c.memoryGb}`, c]));
  const models = IPHONE_MODELS.filter((m) => MEMORY_OPTIONS.some((g) => byKey.has(`${m}|${g}`)));
  const mems = MEMORY_OPTIONS.filter((g) => cells.some((c) => c.memoryGb === g));

  return (
    <>
      <PageHeader title="Рынок · оценка техники" />
      <MarketTabs user={ctx.user} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Сколько стоит?">
          <form className="space-y-3">
            <Field label="Модель">
              <Select name="model" defaultValue={model ?? ""} required>
                <option value="">Выберите модель</option>
                {IPHONE_MODELS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
            <Field label="Память">
              <Select name="mem" defaultValue={mem ?? ""} required>
                <option value="">Выберите</option>
                {MEMORY_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {memoryLabel(g)}
                  </option>
                ))}
              </Select>
            </Field>
            <fieldset className="space-y-1">
              <legend className="mb-1 text-sm font-medium text-slate-700">Что не так с техникой</legend>
              {CONDITIONS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={c.key} value="1" defaultChecked={!!sp[c.key]} />
                  {c.label} <span className="text-xs text-slate-500">−{c.pct}%</span>
                </label>
              ))}
            </fieldset>
            <button className={btn()}>Оценить</button>
          </form>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {!est && (
            <Card>
              <p className="text-sm text-slate-600">
                Выберите модель и память — CRM посчитает среднюю цену на рынке за последние {MARKET_DAYS} дней и сколько предложить продавцу, чтобы заработать{" "}
                {rub(margin)}. Или нажмите на клетку в таблице ниже.
              </p>
            </Card>
          )}
          {est && model && mem && (
            <Card title={`${model} ${memoryLabel(mem)}`}>
              {market ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Stat label="Предложить продавцу" value={<span className="text-green-700">{rub(offer)}</span>} sub={`заработаем ~${rub(margin)}`} />
                    <Stat label="Средняя цена рынка" value={rub(market.median)} sub={source} />
                    <Stat label="Обычно продают за" value={`${rub(market.low)} – ${rub(market.high)}`} sub={`${market.count} объявл.${market.count < MIN_COUNT ? " · мало данных" : ""}`} />
                  </div>
                  {deductPct > 0 && (
                    <p className="mt-3 text-sm text-red-700">
                      С учётом состояния ({picked.map((c) => c.label.toLowerCase()).join(", ")}) цена продажи ~{rub(marketAdj)}, это −{deductPct}%.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-600">По этой модели пока нет объявлений без дефектов. Добавьте источники в «Источниках» или подключите Авито.</p>
              )}
              <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
                <div>Собранные объявления: {est.listings ? `~${rub(est.listings.median)} (${est.listings.count})` : "нет данных"}</div>
                <div>Авито сейчас: {est.avito.stats ? `~${rub(est.avito.stats.median)} (${est.avito.stats.count})` : (est.avito.error ?? "нет данных")}</div>
                <div>Ваши продажи: {est.ownSales ? `~${rub(est.ownSales.median)} (${est.ownSales.count})` : "ещё не продавали"}</div>
              </div>
            </Card>
          )}
          {est && model && mem && (
            <Card title="Цена за 30 дней">
              <PriceLine points={history} format={rub} />
            </Card>
          )}
          {fresh.length > 0 && (
            <Card title="Свежие объявления">
              <ul className="divide-y divide-slate-100">
                {fresh.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <Link href={`/market/search/${l.id}`} className="block truncate text-sm font-medium hover:underline">
                        {l.title}
                      </Link>
                      <div className="mt-1">
                        <DeviceChips d={l} />
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">{dt(l.postedAt ?? l.createdAt)}</div>
                    </div>
                    <div className="shrink-0 font-semibold">{rub(l.price)}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Card title="Рынок iPhone: сколько предлагать" className="mt-4">
        {models.length === 0 ? (
          <p className="text-sm text-slate-500">Таблица заполнится, когда соберутся объявления из источников (VK, Telegram, Авито).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="px-2 py-1 font-medium">Модель</th>
                  {mems.map((g) => (
                    <th key={g} className="px-2 py-1 font-medium">
                      {memoryLabel(g)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-2 py-1.5 font-medium">{m}</td>
                    {mems.map((g) => {
                      const c = byKey.get(`${m}|${g}`);
                      const active = m === model && g === mem;
                      return (
                        <td key={g} className="px-1 py-1">
                          {c ? (
                            <Link
                              href={`/market?model=${encodeURIComponent(m)}&mem=${g}`}
                              className={`block rounded-md px-2 py-1 hover:bg-slate-100 ${active ? "ring-2 ring-blue-500" : ""}`}
                              title={`Рынок ~${rub(c.median)}, обычно ${rub(c.low)} – ${rub(c.high)}, ${c.count} объявл.`}
                            >
                              <span className="font-semibold text-green-700">{rub(suggestedBuyPrice(c.median, margin))}</span>
                              <span className="block text-xs text-slate-500">
                                ~{rub(c.median)}
                                {c.trend !== null && c.trend !== 0 && (
                                  <span className={c.trend > 0 ? "text-green-700" : "text-red-700"}>
                                    {" "}
                                    {c.trend > 0 ? "▲" : "▼"}
                                    {Math.abs(c.trend)}%
                                  </span>
                                )}
                                {c.count < MIN_COUNT && " · мало"}
                              </span>
                            </Link>
                          ) : (
                            <span className="block px-2 text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">
              Зелёным — сколько предлагать продавцу (средняя цена минус {rub(margin)}). Серым — средняя цена рынка и изменение за неделю. Считаются только объявления без дефектов
              и замен за {MARKET_DAYS} дней.
            </p>
          </div>
        )}
      </Card>
    </>
  );
}
