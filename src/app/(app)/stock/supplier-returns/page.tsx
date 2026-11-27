import { DocList } from "../_ui/doc-list";
import type { DocFilter } from "@/lib/domain/stock-docs";

export default async function SupplierReturnsPage({ searchParams }: { searchParams: Promise<DocFilter> }) {
  return <DocList filter={await searchParams} types={["SUPPLIER_RETURN"]} action="SUPPLIER_RETURN" actionLabel="Возврат поставщику" title="Возвраты поставщикам" />;
}
