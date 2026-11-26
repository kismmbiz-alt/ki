import Link from "next/link";
import { requireLocation, requirePermission } from "@/lib/auth";
import { dt, PageHeader } from "@/components/ui";
import { Form, Submit } from "@/components/form";
import { SaleCart } from "@/components/sale-cart";
import { currentShift } from "@/lib/domain/sales";
import { groupOptions } from "../stock/_ui/product-fields";
import { createSaleAction, openShiftAction } from "./actions";
import { SalesTabs } from "./_tabs";

export default async function SalesPage() {
  const ctx = await requirePermission("sales");
  const loc = requireLocation(ctx);
  const { db } = ctx;
  const [products, groups, shift] = await Promise.all([
    db.product.findMany({ where: { isActive: true }, include: { stocks: true }, orderBy: { name: "asc" } }),
    db.productGroup.findMany({ orderBy: { name: "asc" } }),
    currentShift({ db, companyId: ctx.company.id }, loc.id),
  ]);
  const list = products
    .map((p) => {
      const qty = p.stocks.find((s) => s.locationId === loc.id)?.qty ?? 0;
      const other = p.stocks.filter((s) => s.locationId !== loc.id).reduce((s, x) => s + x.qty, 0);
      return { id: p.id, name: p.name, sku: p.sku, price: p.price, minPrice: p.minPrice, qty, other, barcode: p.barcode, groupId: p.groupId };
    })
    .filter((p) => p.qty > 0 || p.other > 0)
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader title={`Продажи · ${loc.name}`}>
        {shift ? (
          <Link href="/sales/shift" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            Смена открыта с {dt(shift.openedAt)}
          </Link>
        ) : (
          <Form action={openShiftAction} resetOnOk={false}>
            <Submit variant="success">Открыть смену</Submit>
          </Form>
        )}
      </PageHeader>
      <SalesTabs />
      <Form action={createSaleAction} resetOnOk={false}>
        <SaleCart products={list} groups={groupOptions(groups)}>
          <Submit className="w-full py-3 text-base">Провести продажу</Submit>
        </SaleCart>
      </Form>
    </>
  );
}
