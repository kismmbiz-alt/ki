import { NavLink } from "@/components/nav-link";

export function SettingsTabs({ admin }: { admin: boolean }) {
  const tabs = [
    { href: "/settings", label: "Общие" },
    ...(admin
      ? [
          { href: "/settings/locations", label: "Точки" },
          { href: "/settings/users", label: "Сотрудники" },
          { href: "/settings/statuses", label: "Статусы" },
          { href: "/settings/catalog", label: "Прайс и источники" },
        ]
      : []),
  ];
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 pb-2">
      {tabs.map((t) => (
        <NavLink key={t.href} href={t.href}>
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
