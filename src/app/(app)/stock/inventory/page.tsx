import { DocList } from "../_ui/doc-list";

export default function InventoryPage() {
  return <DocList types={["INVENTORY"]} action="INVENTORY" actionLabel="Новая инвентаризация" />;
}
