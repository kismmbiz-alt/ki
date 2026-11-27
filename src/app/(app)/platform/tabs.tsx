import { NavLink } from "@/components/nav-link";

export function PlatformTabs() {
  const tabs = [
    { href: "/platform", label: "Стабильность", exact: true },
    { href: "/platform/companies", label: "Компании" },
    { href: "/platform/invites", label: "Приглашения" },
    { href: "/platform/support", label: "Журнал поддержки" },
  ];
  return (
    <div className="scroll-thin mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <NavLink key={t.href} href={t.href} exact={t.exact}>
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}

export const ago = (d: Date | null | undefined) => {
  if (!d) return "никогда";
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч назад`;
  const days = Math.round(h / 24);
  return `${days} дн назад`;
};

export const bytes = (n: number | null | undefined) => {
  if (n == null) return "—";
  const u = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
};

export const dur = (sec: number) => {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d ? `${d} дн ${h} ч` : h ? `${h} ч ${m} мин` : `${m} мин`;
};
