import { DocList } from "../_ui/doc-list";

export default function ReceiptsPage() {
  return <DocList types={["RECEIPT"]} action="RECEIPT" actionLabel="Новое поступление" />;
}
