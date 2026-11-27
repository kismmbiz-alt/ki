import { DocList } from "../_ui/doc-list";
import type { DocFilter } from "@/lib/domain/stock-docs";

export default async function WriteoffsPage({ searchParams }: { searchParams: Promise<DocFilter> }) {
  return <DocList filter={await searchParams} types={["WRITEOFF"]} action="WRITEOFF" actionLabel="Списать" title="Списания" />;
}
