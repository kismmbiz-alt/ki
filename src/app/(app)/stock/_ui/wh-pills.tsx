import Link from "next/link";
import { Settings2 } from "lucide-react";

/** Переключатель складов точки. Ссылки сохраняют остальные параметры страницы. */
export function WarehousePills({
  warehouses,
  current,
  href,
  allLabel,
  manage,
}: {
  warehouses: { id: string; name: string }[];
  current: string | null;
  href: (w: string | null) => string;
  allLabel?: string;
  manage?: boolean;
}) {
  const pill = (on: boolean) => `whitespace-nowrap rounded-md px-3 py-1.5 ${on ? "bg-blue-600 on-accent" : "text-slate-600 hover:bg-slate-100"}`;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1 text-sm">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Склад:</span>
      {allLabel && (
        <Link href={href(null)} className={pill(!current)}>
          {allLabel}
        </Link>
      )}
      {warehouses.map((w) => (
        <Link key={w.id} href={href(w.id)} className={pill(current === w.id)}>
          {w.name}
        </Link>
      ))}
      {manage && (
        <Link href="/settings/places" className="ml-1 flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-blue-600 hover:bg-slate-100">
          <Settings2 size={14} /> склады и кассы
        </Link>
      )}
    </div>
  );
}
