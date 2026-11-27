import { NavLink } from "@/components/nav-link";
import { can, requireUser } from "@/lib/auth";

/** Вкладки настроек: каждому видны только разрешённые разделы. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function SettingsTabs(_props: { admin?: boolean } = {}) {
  const { user } = await requireUser();
  const settings = can(user, "settings");
  const users = can(user, "users");
  const tabs = [
    { href: "/settings", label: "Общие" },
    ...(settings ? [{ href: "/settings/locations", label: "Точки и план" }, { href: "/settings/places", label: "Склады и кассы" }] : []),
    ...(users ? [{ href: "/settings/users", label: "Сотрудники" }, { href: "/settings/positions", label: "Должности и права" }] : []),
    ...(settings
      ? [
          { href: "/settings/statuses", label: "Статусы" },
          { href: "/settings/prices", label: "Цены" },
          { href: "/settings/prints", label: "Печатные формы" },
          { href: "/settings/catalog", label: "Прайс и источники" },
          { href: "/settings/dicts", label: "Справочники" },
        ]
      : []),
  ];
  return (
    <div className="scroll-thin mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 pb-2">
      {tabs.map((t) => (
        <NavLink key={t.href} href={t.href}>
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
