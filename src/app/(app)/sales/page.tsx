import Link from "next/link";
import { requireLocation, requirePermission } from "@/lib/auth";
import { dt, PageHeader } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { SaleCart } from "@/components/sale-cart";
import { currentShift } from "@/lib/domain/sales";
import { groupOptions } from "../stock/_ui/product-fields";
import { createSaleAction, openShiftAction } from "./actions";
import { SalesTabs } from "./_tabs";
import { placesFor } from "@/lib/domain/places";
import { CashboxField } from "@/components/place-fields";
import { WarehousePills } from "../stock/_ui/wh-pills";

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("sales");
  const loc = requireLocation(ctx);
  const { db } = ctx;
  const { warehouses, cashboxes } = await placesFor({ db, companyId: ctx.company.id }, loc.id);
  const wh = warehouses.find((w) => w.id === sp.w) ?? warehouses[0];
  const boxId = wh?.cashboxId ?? cashboxes.find((c) => c.locationId === loc.id)?.id ?? cashboxes[0]?.id;
  const [products, groups, shift] = await Promise.all([
    db.product.findMany({ where: { isActive: true }, include: { stocks: true }, orderBy: { name: "asc" } }),
    db.productGroup.findMany({ orderBy: { name: "asc" } }),
    currentShift({ db, companyId: ctx.company.id }, { locationId: loc.id, cashboxId: boxId }),
  ]);
  const list = products
    .map((p) => {
      const qty = p.stocks.find((s) => s.warehouseId === wh?.id)?.qty ?? 0;
      const other = p.stocks.filter((s) => s.warehouseId !== wh?.id).reduce((s, x) => s + x.qty, 0);
      return { id: p.id, name: p.name, sku: p.sku, price: p.price, minPrice: p.minPrice, qty, other, barcode: p.barcode, groupId: p.groupId };
    })
    .filter((p) => p.qty > 0 || p.other > 0)
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));

  return (
    <>
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
      <Form action={createSaleAction} resetOnOk={false}>
        <input type="hidden" name="warehouseId" value={wh?.id ?? ""} />
        <SaleCart products={list} groups={groupOptions(groups)}>
          <CashboxField cashboxes={cashboxes} defaultValue={boxId} label="В кассу" />
          <Submit className="w-full py-3 text-base">Провести продажу</Submit>
        </SaleCart>
      </Form>
    </>
  );
}
