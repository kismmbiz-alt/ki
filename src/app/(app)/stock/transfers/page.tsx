import { DocList } from "../_ui/doc-list";

export default function TransfersPage() {
  return <DocList types={["TRANSFER"]} action="TRANSFER" actionLabel="Переместить" />;
}
