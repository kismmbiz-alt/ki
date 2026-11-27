// Дерево групп товаров: группа → подгруппа → товары (как в LiveSklad).

export type GroupNode = { id: string; name: string; parentId: string | null };
export type FlatGroup = { id: string; name: string; parentId: string | null; depth: number; hasChildren: boolean };

/** Группы по порядку дерева: родитель, затем его подгруппы по алфавиту. */
export function flattenGroups<G extends GroupNode>(groups: G[]): FlatGroup[] {
  const ids = new Set(groups.map((g) => g.id));
  const byParent = new Map<string | null, G[]>();
  for (const g of groups) {
    const p = g.parentId && ids.has(g.parentId) ? g.parentId : null;
    byParent.set(p, [...(byParent.get(p) ?? []), g]);
  }
  const out: FlatGroup[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const g of (byParent.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      out.push({ id: g.id, name: g.name, parentId: g.parentId, depth, hasChildren: (byParent.get(g.id) ?? []).length > 0 });
      walk(g.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Сама группа и все её подгруппы любого уровня. */
export function withDescendants(groups: GroupNode[], id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const g of groups) if (g.parentId === out[i] && !out.includes(g.id)) out.push(g.id);
  return out;
}

/** Цепочка от верхней группы до этой: [iPhone, iPhone 13]. */
export function groupPath(groups: GroupNode[], id: string | null | undefined): GroupNode[] {
  const by = new Map(groups.map((g) => [g.id, g]));
  const path: GroupNode[] = [];
  let cur = id ? by.get(id) : undefined;
  while (cur && !path.includes(cur)) {
    path.unshift(cur);
    cur = cur.parentId ? by.get(cur.parentId) : undefined;
  }
  return path;
}

/** Можно ли сделать newParent родителем группы id (без петель). */
export const canNest = (groups: GroupNode[], id: string, newParent: string | null) => !newParent || !withDescendants(groups, id).includes(newParent);

/** Подпись для выпадающих списков: отступ пробелами, без чёрточек. */
export const indentLabel = (name: string, depth: number) => "    ".repeat(depth) + name;
