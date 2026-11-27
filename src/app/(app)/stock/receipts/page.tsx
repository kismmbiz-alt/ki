import { DocList } from "../_ui/doc-list";
import type { DocFilter } from "@/lib/domain/stock-docs";

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<DocFilter> }) {
  return <DocList filter={await searchParams} types={["RECEIPT"]} action="RECEIPT" actionLabel="Новое поступление" title="Поступления" />;
}
