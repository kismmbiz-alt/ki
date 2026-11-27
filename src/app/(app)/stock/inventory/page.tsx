import { DocList } from "../_ui/doc-list";
import type { DocFilter } from "@/lib/domain/stock-docs";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<DocFilter> }) {
  return <DocList filter={await searchParams} types={["INVENTORY"]} action="INVENTORY" actionLabel="Новая инвентаризация" title="Инвентаризации" />;
}
