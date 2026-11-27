import { DocList } from "../_ui/doc-list";

export default function WriteoffsPage() {
  return <DocList types={["WRITEOFF"]} action="WRITEOFF" actionLabel="Списать" />;
}
