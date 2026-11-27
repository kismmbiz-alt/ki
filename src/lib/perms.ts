import type { Role } from "@prisma/client";

/** Все права, которые можно включать и выключать у должности. */
export const PERMS = [
  { key: "dashboardMoney", group: "Главная", label: "Видеть выручку и выполнение плана" },
  { key: "allOrders", group: "Заказы", label: "Видеть все заказы (иначе только свои)" },
  { key: "orderAssign", group: "Заказы", label: "Назначать мастера и менеджера" },
  { key: "orderPay", group: "Заказы", label: "Принимать оплату, давать скидку, выдавать заказ" },
  { key: "sales", group: "Продажи", label: "Продавать товары" },
  { key: "salesReturn", group: "Продажи", label: "Оформлять возвраты" },
  { key: "belowMin", group: "Продажи", label: "Продавать ниже минимальной цены" },
  { key: "stock", group: "Склад", label: "Видеть остатки" },
  { key: "stockDocs", group: "Склад", label: "Поступления, перемещения, списания, возвраты, инвентаризация" },
  { key: "cost", group: "Склад", label: "Видеть закупочные цены и прибыль" },
  { key: "cash", group: "Финансы", label: "Видеть кассы и операции" },
  { key: "cashOps", group: "Финансы", label: "Записывать приходы и расходы" },
  { key: "cashTransfer", group: "Финансы", label: "Переводить деньги между кассами" },
  { key: "reports", group: "Аналитика", label: "Отчёты и аналитика" },
  { key: "journal", group: "Аналитика", label: "Журнал действий сотрудников" },
  { key: "buyback", group: "Рынок", label: "Оценка, поиск объявлений, выкуп и результаты" },
  { key: "buybackSources", group: "Рынок", label: "Настраивать источники объявлений, наценку и бонусы" },
  { key: "marketSummary", group: "Рынок", label: "Сводка: сколько заработали и на что потратили" },
  { key: "settings", group: "Настройки", label: "Настройки, справочники, склады и кассы" },
  { key: "users", group: "Настройки", label: "Сотрудники и должности" },
  { key: "clientContacts", group: "Бонусы", label: "Видеть телефоны, почту и паспорт клиентов (по умолчанию только владелец)" },
  { key: "bonusManual", group: "Бонусы", label: "Начислять и списывать баллы вручную" },
] as const;

export type Permission = (typeof PERMS)[number]["key"];
export const ALL_PERMS: Permission[] = PERMS.map((p) => p.key);
/** Всё, кроме того, что по умолчанию видит только владелец. */
export const STAFF_ALL: Permission[] = ALL_PERMS.filter((p) => p !== "clientContacts" && p !== "bonusManual");
export const isPerm = (s: string): s is Permission => (ALL_PERMS as string[]).includes(s);

const MANAGER: Permission[] = ["dashboardMoney", "allOrders", "orderAssign", "orderPay", "sales", "salesReturn", "stock", "stockDocs", "cash", "cashOps", "buyback"];
const MASTER: Permission[] = ["stock", "buyback"];

/** Права по умолчанию, если у сотрудника не выбрана должность. */
export const ROLE_PERMS: Record<Role, Permission[]> = {
  OWNER: ALL_PERMS,
  ADMIN: STAFF_ALL,
  MANAGER,
  MASTER,
};

/** Должности, которые создаются в каждой компании. Их можно переименовать и настроить. */
export const DEFAULT_POSITIONS: { name: string; baseRole: Exclude<Role, "OWNER">; perms: Permission[] }[] = [
  { name: "Администратор", baseRole: "ADMIN", perms: STAFF_ALL },
  {
    name: "Редактор",
    baseRole: "MANAGER",
    perms: ["dashboardMoney", "allOrders", "orderAssign", "orderPay", "sales", "salesReturn", "stock", "stockDocs", "cost", "cash", "cashOps", "buyback", "settings"],
  },
  { name: "Менеджер", baseRole: "MANAGER", perms: MANAGER },
  { name: "Перекуп", baseRole: "MANAGER", perms: ["buyback", "sales", "stock", "stockDocs", "cost", "cash", "cashOps"] },
  { name: "Мастер", baseRole: "MASTER", perms: MASTER },
];

export const BASE_ROLE_LABEL: Record<Exclude<Role, "OWNER">, string> = {
  ADMIN: "Полный доступ",
  MANAGER: "Сотрудник",
  MASTER: "Мастер (берёт заказы в работу)",
};

type Subject = { role: Role; perms?: readonly string[] };

/** Есть ли у сотрудника право. Владелец может всё. */
export function can(u: Subject, p: Permission) {
  if (u.role === "OWNER") return true;
  return (u.perms ?? ROLE_PERMS[u.role]).includes(p);
}
