import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { btn, Card, dt, Field, PageHeader, Select } from "@/components/ui";
import { DeviceChips } from "@/components/market";
import { PriceLine } from "@/components/charts";
import { rub } from "@/lib/money";
import { COLORS, CONDITION_HINT, CONDITION_LABEL, CONDITIONS, IPHONE_MODELS, isCondition, MEMORY_OPTIONS, memoryLabel } from "@/lib/market/device";
import { ESTIMATE_DAYS, estimate, MARKET_DAYS, MIN_COUNT, marketTable, priceHistory, suggestedBuyPrice } from "@/lib/market/prices";
import { MarketTabs } from "./tabs";

/** Города для живой проверки на Авито: как в адресе сайта. */
const REGIONS: [string, string][] = [
  ["rossiya", "Вся Россия"],
  ["moskva", "Москва"],
  ["sankt-peterburg", "Санкт-Петербург"],
  ["ekaterinburg", "Екатеринбург"],
  ["novosibirsk", "Новосибирск"],
  ["kazan", "Казань"],
  ["nizhniy_novgorod", "Нижний Новгород"],
  ["chelyabinsk", "Челябинск"],
  ["tyumen", "Тюмень"],
  ["perm", "Пермь"],
  ["ufa", "Уфа"],
  ["samara", "Самара"],
  ["krasnodar", "Краснодар"],
  ["rostov-na-donu", "Ростов-на-Дону"],
  ["omsk", "Омск"],
  ["krasnoyarsk", "Красноярск"],
];

type SP = { model?: string; mem?: string; cond?: string; color?: string; city?: string };

/** Оценка техники как на Авито: город, состояние, модель, память, цвет → рыночная цена и сколько предложить. */
export default async function EstimatePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("buyback");
  const t = { db: ctx.db, companyId: ctx.company.id };
  const margin = ctx.company.marketMargin;
  const model = sp.model && (IPHONE_MODELS as readonly string[]).includes(sp.model) ? sp.model : null;
  const mem = sp.mem && MEMORY_OPTIONS.includes(Number(sp.mem)) ? Number(sp.mem) : null;
  const cond = isCondition(sp.cond) ? sp.cond : "GOOD";
  const color = sp.color && COLORS.some((c) => c.label === sp.color) ? sp.color : null;
  const regions = REGIONS.some(([s]) => s === ctx.company.avitoRegion) ? REGIONS : [[ctx.company.avitoRegion, ctx.company.avitoRegion] as [string, string], ...REGIONS];
  const city = sp.city && regions.some(([s]) => s === sp.city) ? sp.city : ctx.company.avitoRegion;

  const [cells, est, history] = await Promise.all([
    marketTable(t),
    model && mem ? estimate(t, model, mem, { region: city, condition: cond, color }) : null,
    model && mem ? priceHistory(t, model, mem, 30) : [],
  ]);
  const market = est?.picked.stats ?? null;
  const offer = market ? suggestedBuyPrice(market.median, margin) : 0;
  const total = est ? est.counts.listings + est.counts.avito : 0;

  const byKey = new Map(cells.map((c) => [`${c.model}|${c.memoryGb}`, c]));
  const models = IPHONE_MODELS.filter((m) => MEMORY_OPTIONS.some((g) => byKey.has(`${m}|${g}`)));
  const mems = MEMORY_OPTIONS.filter((g) => cells.some((c) => c.memoryGb === g));
  const link = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ model: model ?? undefined, mem: mem ? String(mem) : undefined, cond, color: color ?? undefined, city, ...patch })) if (v) p.set(k, v);
    return `/market?${p}`;
  };

  return (
    <>
      <PageHeader title="Рынок · оценка техники" />
      <MarketTabs user={ctx.user} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Узнайте, сколько стоит смартфон">
          <form className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Город">
                <Select name="city" defaultValue={city}>
                  {regions.map(([s, n]) => (
                    <option key={s} value={s}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Состояние">
                <Select name="cond" defaultValue={cond}>
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {CONDITION_LABEL[c]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Модель">
              <Select name="model" defaultValue={model ?? ""} required>
                <option value="">Выберите модель</option>
                {IPHONE_MODELS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
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
              <Field label="Цвет">
                <Select name="color" defaultValue={color ?? ""}>
                  <option value="">Любой</option>
                  {COLORS.map((c) => (
                    <option key={c.label}>{c.label}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <p className="text-xs text-slate-500">
              {CONDITION_LABEL[cond]}: {CONDITION_HINT[cond]}.
            </p>
            <button className={btn()}>Узнать цену</button>
          </form>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {!est && (
            <Card>
              <p className="text-sm text-slate-600">
                Укажите параметры, чтобы увидеть оценку. CRM покажет, по какой цене продают такие же телефоны, и сколько предложить продавцу, чтобы заработать {rub(margin)}.
                Или нажмите на клетку в таблице ниже.
              </p>
            </Card>
          )}
          {est && model && mem && (
            <Card>
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-500">
                    {model} {memoryLabel(mem)}
                    {color ? `, ${color}` : ""} · {CONDITION_LABEL[cond]}
                  </div>
                  {market ? (
                    <>
                      <div className="mt-1 text-2xl font-semibold">
                        Рыночная цена: {rub(market.low)} — {rub(market.high)}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {est.picked.derived
                          ? `По состоянию «${CONDITION_LABEL[cond]}» объявлений мало, поэтому цена пересчитана от других состояний.`
                          : `Рассчитана по ${market.count} объявл. за ${ESTIMATE_DAYS} дней${est.byColor ? `, только ${color}` : ""}.`}
                        {color && !est.byColor && " Цвет не учтён: таких объявлений пока мало."}
                      </p>
                      <div className="mt-3 inline-block rounded-lg bg-green-50 px-4 py-2">
                        <div className="text-xs text-green-700">Предложить продавцу</div>
                        <div className="text-2xl font-semibold text-green-700">{rub(offer)}</div>
                        <div className="text-xs text-green-700">средняя {rub(market.median)} минус {rub(margin)} заработка</div>
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-slate-600">
                      По этой модели пока нет объявлений. Добавьте источники во вкладке «Источники» или подключите Авито.
                    </p>
                  )}
                  <p className="mt-3 text-xs text-slate-500">
                    Собранных объявлений: {est.counts.listings} · Авито сейчас: {est.avitoError ?? `${est.counts.avito} объявл.`}
                    {est.ownSales && ` · ваши продажи: ~${rub(est.ownSales.median)} (${est.ownSales.count})`}
                  </p>
                </div>
                {est.example && (
                  <Link href={`/market/search/${est.example.id}`} className="block w-full shrink-0 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 sm:w-56">
                    {est.example.photoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={est.example.photoUrl} alt="" className="mb-2 h-32 w-full rounded-md object-cover" referrerPolicy="no-referrer" />
                    )}
                    <div className="text-xs text-slate-500">Похожее объявление</div>
                    <div className="truncate text-sm font-medium">{est.example.title}</div>
                    <div className="font-semibold">{rub(est.example.price)}</div>
                    <div className="mt-1">
                      <DeviceChips d={est.example} />
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{dt(est.example.postedAt ?? est.example.createdAt)}</div>
                  </Link>
                )}
              </div>
            </Card>
          )}
          {est && model && mem && total > 0 && (
            <Card title="Цена по состояниям">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      <th className="px-2 py-1 font-medium">Состояние</th>
                      <th className="px-2 py-1 font-medium">Рыночная цена</th>
                      <th className="px-2 py-1 font-medium">Предложить</th>
                      <th className="px-2 py-1 font-medium">Объявлений</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CONDITIONS.map((c) => {
                      const s = est.byCondition[c];
                      return (
                        <tr key={c} className={`border-t border-slate-100 ${c === cond ? "bg-blue-50" : ""}`}>
                          <td className="px-2 py-1.5">
                            <Link href={link({ cond: c })} className="font-medium hover:underline">
                              {CONDITION_LABEL[c]}
                            </Link>
                          </td>
                          <td className="px-2 py-1.5">{s.stats ? `${rub(s.stats.low)} — ${rub(s.stats.high)}` : "—"}</td>
                          <td className="px-2 py-1.5 font-semibold text-green-700">{s.stats ? rub(suggestedBuyPrice(s.stats.median, margin)) : "—"}</td>
                          <td className="px-2 py-1.5 text-slate-500">{s.derived ? `${s.stats?.count ?? 0} · пересчитано` : (s.stats?.count ?? 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          {est && model && mem && (
            <Card title="Цена за 30 дней">
              <PriceLine points={history} format={rub} />
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
                              href={link({ model: m, mem: String(g) })}
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
