import { DocList } from "../_ui/doc-list";
import type { DocFilter } from "@/lib/domain/stock-docs";

export default async function TransfersPage({ searchParams }: { searchParams: Promise<DocFilter> }) {
  return <DocList filter={await searchParams} types={["TRANSFER"]} action="TRANSFER" actionLabel="Переместить" title="Перемещения" />;
}
