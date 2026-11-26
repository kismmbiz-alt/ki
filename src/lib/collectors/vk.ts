import type { FoundPost } from "./text";

const API = "https://api.vk.com/method/wall.get";
const VERSION = "5.199";

/** Ссылка на группу ВК → параметр для wall.get: owner_id для club123/public123, иначе domain. */
export function parseVkUrl(url: string): { owner_id: string } | { domain: string } {
  const m = url.trim().match(/^(?:https?:\/\/)?(?:m\.)?vk\.(?:com|ru)\/([A-Za-z0-9_.]+)\/?(?:[?#].*)?$/);
  if (!m) throw new Error("Ссылка на ВК должна быть вида https://vk.com/название_группы");
  const slug = m[1];
  const num = slug.match(/^(?:club|public|event)(\d+)$/);
  if (num) return { owner_id: `-${num[1]}` };
  return { domain: slug };
}

type VkPhotoSize = { url: string; width: number };
type VkPost = {
  id: number;
  owner_id: number;
  date: number;
  text: string;
  marked_as_ads?: number;
  attachments?: { type: string; photo?: { sizes: VkPhotoSize[] } }[];
};

/** Разбор ответа wall.get. Вынесен отдельно, чтобы проверять тестами без сети. */
export function parseVkResponse(json: unknown): FoundPost[] {
  const j = json as { error?: { error_msg: string; error_code: number }; response?: { items: VkPost[] } };
  if (j.error) {
    if (j.error.error_code === 15 || j.error.error_code === 30) throw new Error("Группа закрыта, посты недоступны");
    if (j.error.error_code === 5) throw new Error("Неверный ключ доступа ВК (VK_SERVICE_TOKEN)");
    if (j.error.error_code === 100 || j.error.error_code === 18) throw new Error("Группа не найдена");
    throw new Error(`ВК: ${j.error.error_msg}`);
  }
  const items = j.response?.items ?? [];
  return items
    .filter((p) => !p.marked_as_ads && p.text?.trim())
    .map((p) => {
      const photo = p.attachments?.find((a) => a.type === "photo")?.photo;
      const best = photo?.sizes?.slice().sort((a, b) => b.width - a.width)[0];
      return {
        url: `https://vk.com/wall${p.owner_id}_${p.id}`,
        text: p.text,
        postedAt: new Date(p.date * 1000),
        photoUrl: best?.url ?? null,
      };
    });
}

export async function fetchVk(url: string): Promise<FoundPost[]> {
  const token = process.env.VK_SERVICE_TOKEN;
  if (!token) throw new Error("Не задан сервисный ключ ВК (VK_SERVICE_TOKEN), см. инструкцию");
  const params = new URLSearchParams({ ...parseVkUrl(url), count: "30", access_token: token, v: VERSION });
  const res = await fetch(`${API}?${params}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`ВК ответил ошибкой ${res.status}`);
  return parseVkResponse(await res.json());
}
