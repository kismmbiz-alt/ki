import type { DictKind } from "@prisma/client";
import type { Tenant, Tx } from "../db";

export const DICT_LABEL: Record<DictKind, string> = {
  ORDER_TYPE: "Типы заказа",
  DEVICE_TYPE: "Типы устройств",
  BRAND: "Марки",
  MODEL: "Модели",
  COLOR: "Цвета",
  DEFECT: "Неисправности",
  EQUIPMENT: "Комплектация",
  APPEARANCE: "Внешний вид",
};

export const DICT_KINDS = Object.keys(DICT_LABEL) as DictKind[];

export const DICT_DEFAULTS: Record<DictKind, string[]> = {
  ORDER_TYPE: ["Платный", "Гарантийный", "Повторный", "Бесплатная диагностика"],
  DEVICE_TYPE: ["Телефон", "Планшет", "Ноутбук", "Компьютер", "Монитор", "Телевизор", "Часы", "Наушники", "Игровая приставка", "Фотоаппарат", "Бытовая техника"],
  BRAND: ["Apple", "Samsung", "Xiaomi", "Redmi", "POCO", "Huawei", "Honor", "Realme", "Tecno", "Infinix", "OPPO", "Vivo", "Nokia", "Lenovo", "Asus", "Acer", "HP", "Sony"],
  MODEL: [],
  COLOR: ["черный", "белый", "серый", "серебристый", "золотой", "синий", "голубой", "зеленый", "красный", "розовый", "фиолетовый"],
  DEFECT: ["Замена дисплейного модуля", "Замена стекла", "Замена аккумулятора", "Не включается", "Не заряжается", "Попадание влаги", "Замена разъема зарядки", "Сброс пароля", "Сброс Google аккаунта", "Прошивка", "Диагностика", "Нет звука", "Не работает камера"],
  EQUIPMENT: ["Телефон", "Без сим-карты", "С сим-картой", "Чехол", "Зарядное устройство", "Кабель", "Коробка", "Карта памяти"],
  APPEARANCE: ["Царапины", "Потертости", "Сколы", "Трещина на экране", "Трещина на корпусе", "Вмятины", "Б/у состояние", "Как новый"],
};

/** Заполняет пустые справочники стандартными значениями (один раз на компанию). */
export async function ensureDictionaries({ db }: Tenant) {
  const have = await db.dictItem.groupBy({ by: ["kind"], _count: true });
  const filled = new Set(have.map((h) => h.kind));
  const rows = DICT_KINDS.filter((k) => !filled.has(k)).flatMap((kind) =>
    DICT_DEFAULTS[kind].map((value, sort) => ({ kind, value, sort, companyId: "" })),
  );
  if (rows.length) await db.dictItem.createMany({ data: rows, skipDuplicates: true });
}

export async function loadDictionaries(t: Tenant) {
  await ensureDictionaries(t);
  const items = await t.db.dictItem.findMany({ orderBy: [{ sort: "asc" }, { value: "asc" }] });
  const out = Object.fromEntries(DICT_KINDS.map((k) => [k, [] as string[]])) as Record<DictKind, string[]>;
  for (const i of items) out[i.kind].push(i.value);
  return out;
}

/** Разбивает строку «a, b, c» на отдельные значения. */
export const splitTags = (s: string | null | undefined) =>
  (s ?? "")
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/** Новые значения, введённые при приёмке, запоминаются в справочнике. */
export async function learnTx(tx: Tx, values: Partial<Record<DictKind, string | null | undefined>>) {
  const data: { kind: DictKind; value: string; companyId: string; sort: number }[] = [];
  for (const [kind, raw] of Object.entries(values) as [DictKind, string | null | undefined][]) {
    const list = kind === "EQUIPMENT" || kind === "APPEARANCE" || kind === "DEFECT" ? splitTags(raw) : raw?.trim() ? [raw.trim()] : [];
    for (const value of list) if (value.length <= 120) data.push({ kind, value, companyId: "", sort: 1000 });
  }
  if (data.length) await tx.dictItem.createMany({ data, skipDuplicates: true });
}
