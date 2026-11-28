import Link from "next/link";
import { can, requireLocation, requirePermission } from "@/lib/auth";
import { priceOf, priceOptions } from "@/lib/domain/prices";
import { dt, PageHeader } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { SaleCart } from "@/components/sale-cart";
import { currentShift } from "@/lib/domain/sales";
import { withDescendants } from "@/lib/domain/groups";
import { groupOptions } from "../stock/_ui/product-fields";
import { bonusLookupAction, createSaleAction, openShiftAction } from "./actions";
import { SalesTabs } from "./_tabs";
import { saleTiles } from "@/lib/domain/sale-tiles";
import { placesFor } from "@/lib/domain/places";
import { CashboxField } from "@/components/place-fields";
import { WarehousePills } from "../stock/_ui/wh-pills";

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("sales");
  const loc = requireLocation(ctx);
  const { db } = ctx;
  const hideMin = ctx.company.hideMinPrice && !can(ctx.user, "belowMin");
  const { warehouses, cashboxes } = await placesFor({ db, companyId: ctx.company.id }, loc.id, ctx.user);
  const wh = warehouses.find((w) => w.id === sp.w) ?? warehouses[0];
  const boxId = wh?.cashboxId ?? cashboxes.find((c) => c.locationId === loc.id)?.id ?? cashboxes[0]?.id;
  const [products, groups, shift] = await Promise.all([
    db.product.findMany({ where: { isActive: true }, include: { stocks: true, prices: true }, orderBy: { name: "asc" } }),
    db.productGroup.findMany({ orderBy: { name: "asc" } }),
    currentShift({ db, companyId: ctx.company.id }, { locationId: loc.id, cashboxId: boxId }),
  ]);
  const opts = (await priceOptions(db, ctx.company.id)).filter((o) => o.key !== "cost" && (o.key !== "min" || !hideMin));
  const list = products
    .map((p) => {
      const prices = Object.fromEntries(opts.map((o) => [o.key, priceOf(p, o.key)]));
      const qty = p.stocks.find((s) => s.warehouseId === wh?.id)?.qty ?? 0;
      const other = p.stocks.filter((s) => s.warehouseId !== wh?.id).reduce((s, x) => s + x.qty, 0);
      return { id: p.id, name: p.name, sku: p.sku, price: p.price, minPrice: hideMin ? null : p.minPrice, qty, other, barcode: p.barcode, groupId: p.groupId, prices, isService: p.isService };
    })
    // работы и услуги всегда доступны: у них нет остатков
    .filter((p) => p.isService || p.qty > 0 || p.other > 0)
    .sort((a, b) => Number(!!a.isService) - Number(!!b.isService) || b.qty - a.qty || a.name.localeCompare(b.name));

  const tiles = await saleTiles(db, new Set(list.map((p) => p.id)));

  // на компьютере экран продажи занимает ровно высоту окна: без прокрутки страницы
  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3rem)]">
      <PageHeader title={`Продажи · ${loc.name}`}>
        {shift ? (
          <Link href={`/sales/shift?c=${boxId ?? ""}`} className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            Смена открыта с {dt(shift.openedAt)}
          </Link>
        ) : (
          <Form action={openShiftAction} resetOnOk={false}>
            <input type="hidden" name="cashboxId" value={boxId ?? ""} />
            <Submit variant="success">Открыть смену</Submit>
          </Form>
        )}
      </PageHeader>
      <SalesTabs />
      {warehouses.length > 1 && <WarehousePills warehouses={warehouses} current={wh?.id ?? null} href={(w) => `/sales?w=${w}`} />}
      <Form action={createSaleAction} resetOnOk={false} className="flex min-h-0 flex-1 flex-col">
        <input type="hidden" name="warehouseId" value={wh?.id ?? ""} />
        <SaleCart maxDiscountPct={ctx.user.role === "OWNER" ? null : (ctx.user.position?.maxDiscountPct ?? null)} tiles={tiles} tilesHref={can(ctx.user, "settings") ? "/sales/tiles" : undefined} bonus={ctx.company.bonusEnabled ? { maxPct: ctx.company.bonusMaxPayPct } : null} lookup={bonusLookupAction} products={list} groups={groupOptions(groups).map((x) => ({ ...x, ids: withDescendants(groups, x.id) }))} priceOptions={opts} defaultPriceKey={opts.some((o) => o.key === ctx.company.salePriceKey) ? ctx.company.salePriceKey : "retail"}>
          <CashboxField cashboxes={cashboxes} defaultValue={boxId} label="В кассу" />
          <Submit className="w-full py-3 text-base">Провести продажу</Submit>
        </SaleCart>
      </Form>
    </div>
  );
}
