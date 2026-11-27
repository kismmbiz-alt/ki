import { redirect } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ChevronRight, Download, FolderPlus, Plus, Search, Printer } from "lucide-react";
import { flattenGroups, groupPath, withDescendants } from "@/lib/domain/groups";
import { can, requirePermission } from "@/lib/auth";
import { btn, Card, Input, PageHeader, Select } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { RowLink } from "@/components/row-link";
import { rub } from "@/lib/money";
import { bulkProductsAction, createProductAction, saveGroupAction } from "./actions";
import { StockTabs } from "./_ui/tabs";
import { WarehousePills } from "./_ui/wh-pills";
import { groupOptions, ProductFields } from "./_ui/product-fields";

type SP = { q?: string; f?: string; g?: string; new?: string; w?: string };

export default async function StockPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { db, location, locations, user } = await requirePermission("stock");
  const filter = sp.f ?? "pos";
  const where: Prisma.ProductWhereInput = { isActive: filter !== "archive" };
  const q = sp.q?.trim();
  // сканер: точное совпадение штрихкода — сразу в карточку товара
  if (q && /^\S{4,}$/.test(q)) {
    const hit = await db.product.findMany({ where: { barcode: q }, select: { id: true }, take: 2 });
    if (hit.length === 1) redirect(`/stock/${hit[0].id}`);
  }
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { barcode: q }];
  const allGroups = await db.productGroup.findMany({ orderBy: { name: "asc" } });
  if (sp.g === "none") where.groupId = null;
  else if (sp.g) where.groupId = { in: withDescendants(allGroups, sp.g) };

  const warehouses = await db.warehouse.findMany({ where: { isActive: true, locationId: location?.id }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
  const wh = warehouses.find((w) => w.id === sp.w) ?? null;
  const groups = allGroups;
  const [suppliers, products, counts, total] = await Promise.all([
    db.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ where, include: { stocks: true, group: true, supplier: true }, orderBy: { name: "asc" }, take: 2000 }),
    db.product.groupBy({ by: ["groupId"], where: { isActive: true }, _count: true }),
    db.product.count({ where: { isActive: true } }),
  ]);
  const countBy = new Map(counts.map((c) => [c.groupId, c._count]));
  const countIn = (id: string) => withDescendants(groups, id).reduce((n, g) => n + (countBy.get(g) ?? 0), 0);
  const flat = flattenGroups(groups);
  const openIds = new Set(sp.g && sp.g !== "none" ? groupPath(groups, sp.g).map((g) => g.id) : []);
  const visible = flat.filter((g) => !g.parentId || openIds.has(g.parentId));
  const rows = products
    .map((p) => {
      const inHere = (s: { locationId: string; warehouseId: string }) => (wh ? s.warehouseId === wh.id : s.locationId === location?.id);
      const here = p.stocks.filter(inHere).reduce((s, x) => s + x.qty, 0);
      const other = p.stocks.filter((s) => !inHere(s)).reduce((s, x) => s + x.qty, 0);
      return { p, here, other, low: p.minQty > 0 && here <= p.minQty };
    })
    .filter((r) => (filter === "pos" ? r.here > 0 : filter === "low" ? r.low : filter === "zero" ? r.here <= 0 : true))
    .sort((a, b) => b.here - a.here || a.p.name.localeCompare(b.p.name));
  const showCost = can(user, "cost");
  const tagRows = rows.filter((r) => r.here > 0).slice(0, 150);
  const value = rows.reduce((s, r) => s + Math.max(r.here, 0) * r.p.cost, 0);
  const qs = (o: Partial<SP>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, new: undefined, ...o })) if (v) u.set(k, v);
    return `/stock?${u}`;
  };
  const tree = groupOptions(groups);

  return (
    <>
      <PageHeader title="Остатки">
        <a href={`/stock/export?${new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][])}`} className={btn("secondary")}>
          <Download size={16} /> Экспорт
        </a>
        {tagRows.length > 0 && (
          <a href={`/print/t?products=${tagRows.map((r) => r.p.id).join(",")}&qty=${tagRows.map((r) => r.here).join(",")}`} target="_blank" className={btn("secondary")} title="Ценники на товары из списка — по количеству в наличии (до 150 позиций)">
            <Printer size={16} /> Ценники
          </a>
        )}
        <Link href={qs({ new: "1" })} className={btn()}>
          <Plus size={16} /> Товар
        </Link>
      </PageHeader>
      <StockTabs />
      <WarehousePills warehouses={warehouses} current={wh?.id ?? null} href={(w) => qs({ w: w ?? undefined })} allLabel={warehouses.length > 1 ? "Все склады" : undefined} manage={can(user, "settings")} />

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-2 text-sm">
            <GroupLink href={qs({ g: undefined })} on={!sp.g} label="Все товары" n={total} />
            <GroupLink href={qs({ g: "none" })} on={sp.g === "none"} label="Без группы" n={countBy.get(null) ?? 0} />
            <div className="my-1 border-t border-slate-100" />
            {visible.map((g) => (
              <GroupLink key={g.id} href={qs({ g: g.id })} on={sp.g === g.id} label={g.name} n={countIn(g.id)} depth={g.depth} tree={g.hasChildren ? (openIds.has(g.id) ? "open" : "closed") : undefined} />
            ))}
          </div>
          <details className="rounded-xl border border-slate-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm text-blue-600">
              <FolderPlus size={15} /> Новая группа
            </summary>
            <Form action={saveGroupAction} className="space-y-2 border-t border-slate-100 p-3">
              <Input name="name" placeholder="Название" required />
              <Select name="parentId" defaultValue="">
                <option value="">Верхний уровень</option>
                {tree.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </Select>
              <Submit variant="secondary">Создать</Submit>
            </Form>
          </details>
          {sp.g && sp.g !== "none" && (
            <details className="rounded-xl border border-slate-200 bg-white">
              <summary className="cursor-pointer list-none px-3 py-2 text-sm text-slate-500">Изменить группу</summary>
              <Form action={saveGroupAction} className="space-y-2 border-t border-slate-100 p-3" resetOnOk={false}>
                <input type="hidden" name="id" value={sp.g} />
                <Input name="name" defaultValue={groups.find((g) => g.id === sp.g)?.name} required />
                <Select name="parentId" defaultValue={groups.find((g) => g.id === sp.g)?.parentId ?? ""}>
                  <option value="">Верхний уровень</option>
                  {tree
                    .filter((g) => g.id !== sp.g)
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                      </option>
                    ))}
                </Select>
                <div className="flex gap-2">
                  <Submit variant="secondary">Сохранить</Submit>
                  <button name="delete" value="1" className={btn("danger")} formNoValidate>
                    Удалить
                  </button>
                </div>
              </Form>
            </details>
          )}
        </aside>

        <div className="min-w-0 space-y-3">
          {sp.new && (
            <Card title={`Новый товар · приход на «${(wh ?? warehouses[0])?.name ?? location?.name ?? ""}»`} actions={<Link href={qs({})} className="text-sm text-slate-500">Закрыть</Link>}>
              <Form action={createProductAction} className="space-y-3">
                <input type="hidden" name="warehouseId" value={(wh ?? warehouses[0])?.id ?? ""} />
                <ProductFields groups={groups} suppliers={suppliers} defaultGroupId={sp.g !== "none" ? sp.g : undefined} showCost={false} />
                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                  <Input name="qty" inputMode="numeric" placeholder="Приход, шт" />
                  <Input name="cost" inputMode="decimal" placeholder="Закупка за шт, ₽" />
                </div>
                <Submit>Добавить товар</Submit>
              </Form>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <form className="relative">
              {sp.g && <input type="hidden" name="g" value={sp.g} />}
              {sp.w && <input type="hidden" name="w" value={sp.w} />}
              <input type="hidden" name="f" value={filter} />
              <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
              <Input name="q" defaultValue={q} placeholder="Название, код, штрихкод" className="w-72 pl-9" />
            </form>
            {[
              ["pos", "В наличии"],
              ["low", "Заканчиваются"],
              ["zero", "Нет в наличии"],
              ["all", "Все"],
              ["archive", "Архив"],
            ].map(([k, l]) => (
              <Link key={k} href={qs({ f: k })} className={`rounded-lg px-3 py-1.5 text-sm ${filter === k ? "bg-blue-600 on-accent" : "text-slate-600 hover:bg-slate-100"}`}>
                {l}
              </Link>
            ))}
          </div>

          <Form action={bulkProductsAction} resetOnOk={false} className="space-y-3">
          {can(user, "stockDocs") && <BulkPanel tree={tree} suppliers={suppliers} archive={filter === "archive"} showCost={showCost} />}
          <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
                <tr>
                  <th className="w-8 py-2.5 pl-3" />
                  <th className="px-3 py-2.5 font-medium">Наименование · {rows.length}</th>
                  <th className="px-3 py-2.5 font-medium">Группа</th>
                  <th className="px-3 py-2.5 font-medium">Поставщик</th>
                  <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Кол-во</th>
                  {(locations.length > 1 || warehouses.length > 1) && <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">{wh ? "Др. склады" : "Др. точки"}</th>}
                  <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Мин.</th>
                  {showCost && <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Закупка</th>}
                  <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Розничная</th>
                  <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Ремонтная</th>
                  <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Минимальная</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ p, here, other, low }) => (
                  <RowLink key={p.id} href={`/stock/${p.id}`}>
                    <td className="py-2 pl-3">
                      <input type="checkbox" name="products" value={p.id} className="h-4 w-4 align-middle" aria-label="Отметить" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-slate-900">{p.name}</div>
                      {(p.sku || p.barcode) && <div className="text-xs text-slate-500">{[p.sku && `Код: ${p.sku}`, p.barcode].filter(Boolean).join(" · ")}</div>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{p.group?.name}</td>
                    <td className="px-3 py-2 text-blue-600">{p.supplier?.name}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${low ? "text-red-600" : "text-slate-900"}`}>{here}</td>
                    {(locations.length > 1 || warehouses.length > 1) && <td className="px-3 py-2 text-right whitespace-nowrap text-slate-500">{other}</td>}
                    <td className="px-3 py-2 text-right whitespace-nowrap text-slate-500">{p.minQty || ""}</td>
                    {showCost && <td className="px-3 py-2 text-right whitespace-nowrap text-slate-500">{p.cost ? rub(p.cost) : ""}</td>}
                    <td className="px-3 py-2 text-right whitespace-nowrap">{rub(p.price)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-slate-600">{p.repairPrice != null ? rub(p.repairPrice) : ""}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-slate-600">{p.minPrice != null ? rub(p.minPrice) : ""}</td>
                  </RowLink>
                ))}
              </tbody>
            </table>
            {!rows.length && <p className="p-10 text-center text-sm text-slate-400">Товаров нет</p>}
          </div>
          </Form>
          {showCost && <p className="text-sm text-slate-500">Товара {wh ? `на складе «${wh.name}»` : "на точке"} по закупочной цене: {rub(value)}</p>}
        </div>
      </div>
    </>
  );
}

function GroupLink({ href, on, label, n, depth = 0, tree }: { href: string; on: boolean; label: string; n: number; depth?: number; tree?: "open" | "closed" }) {
  return (
    <Link href={href} style={{ paddingLeft: 10 + depth * 14 }} className={`flex items-center justify-between rounded-md py-1.5 pr-2.5 ${on ? "bg-blue-50 font-medium text-blue-700" : "text-slate-700 hover:bg-slate-100"}`}>
      <span className="flex min-w-0 items-center gap-1">
        {tree ? <ChevronRight size={13} className={`shrink-0 text-slate-400 transition ${tree === "open" ? "rotate-90" : ""}`} /> : <span className="w-[13px] shrink-0" />}
        <span className="truncate">{label}</span>
      </span>
      <span className="ml-2 text-xs text-slate-400">{n}</span>
    </Link>
  );
}

/** Действия с отмеченными товарами (как в LiveSklad: Печать, Наценить, Изменить, В архив). */
function BulkPanel({ tree, suppliers, archive, showCost }: { tree: { id: string; label: string }[]; suppliers: { id: string; name: string }[]; archive: boolean; showCost: boolean }) {
  const prices = [
    ...(showCost ? [["cost", "Закупочная"]] : []),
    ["price", "Розничная"],
    ["repairPrice", "Ремонтная"],
    ["minPrice", "Минимальная"],
  ];
  return (
    <details className="rounded-xl border border-slate-200 bg-white">
      <summary className="cursor-pointer list-none px-3 py-2 text-sm text-blue-600">Действия с отмеченными товарами</summary>
      <div className="grid gap-4 border-t border-slate-100 p-3 text-sm lg:grid-cols-3">
        <div className="space-y-2">
          <div className="font-medium text-slate-700">Наценить</div>
          <div className="grid grid-cols-2 gap-2">
            <Select name="from" defaultValue={showCost ? "cost" : "price"} title="Наценить от">
              {prices.map(([k, l]) => (
                <option key={k} value={k}>
                  от: {l}
                </option>
              ))}
            </Select>
            <Select name="to" defaultValue="price" title="Какую цену поменять">
              {prices
                .filter(([k]) => k !== "cost")
                .map(([k, l]) => (
                  <option key={k} value={k}>
                    в: {l}
                  </option>
                ))}
            </Select>
            <Input name="pct" inputMode="decimal" placeholder="Наценка, %" />
            <Input name="add" inputMode="decimal" placeholder="Плюс, ₽" />
            <Select name="round" defaultValue="">
              <option value="">Не округлять</option>
              <option value="1">Округлить до 1 ₽</option>
              <option value="10">до 10 ₽</option>
              <option value="50">до 50 ₽</option>
              <option value="100">до 100 ₽</option>
            </Select>
            <button name="op" value="markup" className={btn("secondary")}>
              Наценить
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <div className="font-medium text-slate-700">Изменить</div>
          <div className="grid grid-cols-2 gap-2">
            <Select name="setGroup" defaultValue="">
              <option value="">Группа: не менять</option>
              <option value="none">Без группы</option>
              {tree.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </Select>
            <Select name="setSupplier" defaultValue="">
              <option value="">Поставщик: не менять</option>
              <option value="none">Без поставщика</option>
              {suppliers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
            <Input name="setMinQty" inputMode="numeric" placeholder="Мин. остаток" />
            <Input name="set_price" inputMode="decimal" placeholder="Розничная, ₽" />
            <Input name="set_repairPrice" inputMode="decimal" placeholder="Ремонтная, ₽" />
            <Input name="set_minPrice" inputMode="decimal" placeholder="Минимальная, ₽" />
            <button name="op" value="edit" className={btn("secondary")}>
              Изменить
            </button>
          </div>
          <p className="text-xs text-slate-400">Пустые поля не меняются.</p>
        </div>
        <div className="space-y-2">
          <div className="font-medium text-slate-700">Ещё</div>
          <div className="flex flex-wrap gap-2">
            <button formAction="/print/t" formMethod="get" formTarget="_blank" className={btn("secondary")}>
              <Printer size={15} /> Ценники
            </button>
            <button name="op" value={archive ? "unarchive" : "archive"} className={btn("secondary")}>
              {archive ? "Вернуть из архива" : "В архив"}
            </button>
          </div>
        </div>
      </div>
    </details>
  );
}
