// Распознавание техники в тексте объявления: модель, память, АКБ, комплект, дефекты, замены.
// Работает по тексту продавца, поэтому всё — подсказка, а не гарантия.

import { normalize } from "../collectors/text";

/** Модели iPhone, которые знает «Рынок». Порядок важен: сначала более длинные названия. */
export const IPHONE_MODELS = [
  "iPhone 16 Pro Max", "iPhone 16 Pro", "iPhone 16 Plus", "iPhone 16e", "iPhone 16",
  "iPhone 15 Pro Max", "iPhone 15 Pro", "iPhone 15 Plus", "iPhone 15",
  "iPhone 14 Pro Max", "iPhone 14 Pro", "iPhone 14 Plus", "iPhone 14",
  "iPhone 13 Pro Max", "iPhone 13 Pro", "iPhone 13 mini", "iPhone 13",
  "iPhone 12 Pro Max", "iPhone 12 Pro", "iPhone 12 mini", "iPhone 12",
  "iPhone 11 Pro Max", "iPhone 11 Pro", "iPhone 11",
  "iPhone SE 2022", "iPhone SE 2020", "iPhone XS Max", "iPhone XS", "iPhone XR", "iPhone X",
] as const;

/** Объёмы памяти, которые бывают у каждой модели (ГБ). */
export const MEMORY_OPTIONS = [64, 128, 256, 512, 1024];

export const memoryLabel = (gb: number) => (gb >= 1024 ? `${gb / 1024} ТБ` : `${gb} ГБ`);

const IPHONE_RE =
  /(?:iphone|айфон|ифон|iфон|apple)\s*(?:(1[1-6])(?:\s*(pro\s*max|про\s*макс|promax|pro|про|plus|плюс|mini|мини|e))?|(xs\s*max|xs|xr|x|se)(?:\s*(2020|2022|2|3))?)(?![0-9])/i;

/** Модель iPhone из текста: «айфон 13 про 256» → «iPhone 13 Pro». */
export function detectModel(text: string): string | null {
  const t = normalize(text).replace(/[–—-]/g, " ");
  const m = t.match(IPHONE_RE);
  if (!m) return null;
  if (m[1]) {
    const n = m[1];
    const suf = (m[2] ?? "").replace(/\s+/g, "");
    const kind =
      /^(promax|промакс)$/.test(suf) ? " Pro Max"
      : /^(pro|про)$/.test(suf) ? " Pro"
      : /^(plus|плюс)$/.test(suf) ? " Plus"
      : /^(mini|мини)$/.test(suf) ? " mini"
      : suf === "e" ? "e"
      : "";
    const name = `iPhone ${n}${kind}`;
    return (IPHONE_MODELS as readonly string[]).includes(name) ? name : `iPhone ${n}`;
  }
  const x = (m[3] ?? "").replace(/\s+/g, "");
  if (x === "se") {
    const y = m[4];
    return y === "2022" || y === "3" ? "iPhone SE 2022" : "iPhone SE 2020";
  }
  return { xsmax: "iPhone XS Max", xs: "iPhone XS", xr: "iPhone XR", x: "iPhone X" }[x] ?? null;
}

/** Память: «128гб», «256 gb», «1тб», «512Gb». */
export function detectMemory(text: string): number | null {
  const t = normalize(text);
  const tb = t.match(/(?<![\d.,])1\s*(?:тб|tb)(?![a-zа-я])/i);
  if (tb) return 1024;
  const m = t.match(/(?<![\d.,])(64|128|256|512)\s*(?:гб|gb|г\b|g\b|гиг)?(?![\d])/i);
  return m ? Number(m[1]) : null;
}

/** Ёмкость аккумулятора в процентах: «акб 87%», «аккумулятор 90», «батарея: 85 %», «ёмкость 91». */
export function detectBattery(text: string): number | null {
  const t = normalize(text);
  const m =
    t.match(/(?:акб|аккумулятор[а-яёa-z]*|батаре[а-яёa-z]*|емкост[а-яёa-z]*|battery|состояние\s+батареи|здоровье\s+акб)[^\d\n]{0,15}(\d{2,3})\s*%?/i) ??
    t.match(/(\d{2,3})\s*%\s*(?:акб|аккумулятор|батаре|емкост)/i);
  if (!m) return null;
  const v = Number(m[1]);
  return v >= 50 && v <= 100 ? v : null;
}

type Rule = { label: string; re: RegExp };

/** Что входит в комплект. */
const KIT: Rule[] = [
  { label: "Полный комплект", re: /полн[а-яёa-z]*\s+комплект|комплект\s+полн/ },
  { label: "Коробка", re: /(?<!без\s)коробк|с\s+коробкой|короб(?!к)/ },
  { label: "Без коробки", re: /без\s+коробк/ },
  { label: "Зарядка", re: /(?<!без\s)(зарядк|кабел|провод)/ },
  { label: "Чек", re: /(?<!без\s)чек(?!ан)/ },
  { label: "Только телефон", re: /только\s+(телефон|аппарат)|голый\s+аппарат/ },
];

/** Дефекты — подсвечиваются красным. */
const DEFECTS: Rule[] = [
  { label: "Разбит экран", re: /разбит[а-яёa-z]*\s+(экран|дисплей|стекл)|(экран|дисплей|стекло)\s+разбит|трещин[а-яёa-z]*\s+(на\s+)?(экран|дисплее|стекле)/ },
  { label: "Трещины", re: /трещин/ },
  { label: "Сколы", re: /скол/ },
  { label: "Царапины", re: /царапин|потерт|потёрт/ },
  { label: "Полосы / пятна на экране", re: /полос[а-яёa-z]*\s+на\s+экран|пятн[а-яёa-z]*\s+на\s+экран|выгорани|битые\s+пиксел/ },
  { label: "Не работает Face ID", re: /(не\s+работает|нет|отключен[а-яёa-z]*)\s+face\s*id|face\s*id\s+не\s+работает|фейс\s*айди\s+не/ },
  { label: "Не работает Touch ID", re: /(не\s+работает|нет)\s+touch\s*id|touch\s*id\s+не\s+работает/ },
  { label: "Нет True Tone", re: /(нет|не\s+работает)\s+true\s*tone/ },
  { label: "Вздут аккумулятор", re: /вздут/ },
  { label: "Был в воде", re: /утоп|залит|был\s+в\s+воде|попала\s+вода/ },
  { label: "Не ловит сеть", re: /не\s+ловит|нет\s+сети|не\s+видит\s+сим/ },
  { label: "Привязан iCloud", re: /icloud\s+(не\s+отвязан|заблок|привязан)|залочен|на\s+запчаст/ },
  { label: "Не включается", re: /не\s+включается|не\s+рабоч/ },
  { label: "Плохо держит заряд", re: /плохо\s+держит|быстро\s+садится|быстро\s+разряжа/ },
];

/** Замены деталей — тоже подсвечиваются красным. */
const REPLACEMENTS: Rule[] = [
  { label: "Менялся экран", re: /(замен[а-яёa-z]*|меня[а-яёa-z]*|поменя[а-яёa-z]*|не\s*оригинальн[а-яёa-z]*|неориг[а-яёa-z]*|копи[а-яёa-z]*)\s+(экран|дисплей|модул)|(экран|дисплей)\s+(менял|заменен|замен|не\s*оригинал|неориг|копия)/ },
  { label: "Менялся аккумулятор", re: /(замен[а-яёa-z]*|меня[а-яёa-z]*|поменя[а-яёa-z]*|новый|неориг[а-яёa-z]*)\s+(акб|аккумулятор|батаре)|(акб|аккумулятор|батарея)\s+(менял|заменен|замен|новый|неориг)/ },
  { label: "Менялась крышка / корпус", re: /(замен[а-яёa-z]*|меня[а-яёa-z]*|поменя[а-яёa-z]*)\s+(крышк|корпус|задн[а-яёa-z]*\s+стекл)|(корпус|крышка)\s+(менял|заменен|замен)/ },
  { label: "Менялась камера", re: /(замен[а-яёa-z]*|меня[а-яёa-z]*|поменя[а-яёa-z]*)\s+камер|камера\s+(менял|заменен|замен)/ },
  { label: "Был в ремонте", re: /был\s+в\s+ремонте|ремонтировал|вскрывал|неоригинальн[а-яёa-z]*\s+детал|неизвестная\s+деталь/ },
];

const pick = (t: string, rules: Rule[]) => rules.filter((r) => r.re.test(t)).map((r) => r.label);

export type DeviceInfo = {
  model: string | null;
  memoryGb: number | null;
  batteryPct: number | null;
  kit: string[];
  defects: string[];
  replacements: string[];
};

/** Всё, что удалось понять о технике из текста объявления. */
export function parseDevice(text: string): DeviceInfo {
  const t = normalize(text);
  let defects = pick(t, DEFECTS);
  // «Разбит экран» и так говорит о трещинах — не дублируем
  if (defects.includes("Разбит экран")) defects = defects.filter((d) => d !== "Трещины");
  // фразы вида «без царапин», «без сколов» — это не дефект
  defects = defects.filter((d) => {
    if (d === "Царапины") return !/без\s+(царапин|потертост|потёртост)|ни\s+одной\s+царапин/.test(t);
    if (d === "Сколы") return !/без\s+(сколов|скола)/.test(t);
    if (d === "Трещины") return !/без\s+трещин/.test(t);
    return true;
  });
  const battery = detectBattery(text);
  if (battery !== null && battery < 80 && !defects.includes("Плохо держит заряд")) defects.push(`АКБ ${battery}% — нужна замена`);
  let kit = pick(t, KIT);
  if (kit.includes("Без коробки")) kit = kit.filter((k) => k !== "Коробка");
  return {
    model: detectModel(text),
    memoryGb: detectMemory(text),
    batteryPct: battery,
    kit,
    defects,
    replacements: pick(t, REPLACEMENTS),
  };
}
