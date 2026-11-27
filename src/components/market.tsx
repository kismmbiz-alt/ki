import { rub } from "@/lib/money";
import { CONDITION_LABEL, isCondition, memoryLabel } from "@/lib/market/device";
import { suggestedBuyPrice, type Stats } from "@/lib/market/prices";

type Device = {
  model: string | null;
  memoryGb: number | null;
  batteryPct: number | null;
  kit: string[];
  defects: string[];
  replacements: string[];
  condition?: string | null;
  color?: string | null;
};

const COND_CLS = {
  NEW: "bg-green-50 text-green-700",
  EXCELLENT: "bg-green-50 text-green-700",
  GOOD: "bg-slate-100 text-slate-800",
  FAIR: "bg-amber-50 text-amber-700",
  REPAIR: "bg-red-50 text-red-700",
} as const;

const chip = "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium";

/** Что CRM поняла из объявления. Дефекты и замены — красным. */
export function DeviceChips({ d }: { d: Device }) {
  const okBattery = d.batteryPct !== null && d.batteryPct >= 80;
  return (
    <div className="flex flex-wrap gap-1">
      <span className={`${chip} bg-slate-100 text-slate-800`}>{d.model ?? "модель не распознана"}</span>
      {d.memoryGb && <span className={`${chip} bg-slate-100 text-slate-800`}>{memoryLabel(d.memoryGb)}</span>}
      {d.color && <span className={`${chip} bg-slate-100 text-slate-800`}>{d.color}</span>}
      {isCondition(d.condition) && <span className={`${chip} ${COND_CLS[d.condition]}`}>{CONDITION_LABEL[d.condition]}</span>}
      {d.batteryPct !== null && (
        <span className={`${chip} ${okBattery ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>АКБ {d.batteryPct}%</span>
      )}
      {d.kit.map((k) => (
        <span key={k} className={`${chip} bg-blue-50 text-blue-700`}>
          {k}
        </span>
      ))}
      {[...d.defects, ...d.replacements]
        .filter((x) => !x.startsWith("АКБ "))
        .map((x) => (
          <span key={x} className={`${chip} bg-red-50 text-red-700 ring-1 ring-red-200`}>
            ⚠ {x}
          </span>
        ))}
    </div>
  );
}

/**
 * Предложенная цена выкупа: средняя рынка минус сколько хотим заработать.
 * Зелёным — если продавец просит не больше этой цены, красным — если дороже.
 */
export function BuyVerdict({ market, margin, asked, hasIssues, compact = false }: { market: Stats | null | undefined; margin: number; asked: number | null; hasIssues: boolean; compact?: boolean }) {
  if (!market) return <div className="text-xs text-slate-500">Цена рынка: пока нет данных по этой модели</div>;
  const offer = suggestedBuyPrice(market.median, margin);
  const diff = asked !== null ? offer - asked : null;
  const good = diff !== null && diff >= 0;
  return (
    <div className={compact ? "text-right" : ""}>
      <div className="text-xs text-slate-500">Предложить</div>
      <div className={`text-lg font-semibold ${good ? "text-green-700" : asked !== null ? "text-red-700" : "text-slate-900"}`}>{rub(offer)}</div>
      <div className="text-xs text-slate-500">
        рынок ~{rub(market.median)}
        {market.count < 5 && " · мало данных"}
      </div>
      {diff !== null && (
        <div className={`text-xs ${good ? "text-green-700" : "text-red-700"}`}>
          {good ? `просят на ${rub(diff)} меньше — выгодно` : `просят на ${rub(-diff)} больше`}
        </div>
      )}
      {hasIssues && <div className="text-xs text-red-700">цена без учёта ремонта</div>}
    </div>
  );
}
