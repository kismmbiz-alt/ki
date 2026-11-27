import { DocList } from "../_ui/doc-list";

export default function SupplierReturnsPage() {
  return <DocList types={["SUPPLIER_RETURN"]} action="SUPPLIER_RETURN" actionLabel="Возврат поставщику" title="Возвраты поставщикам" />;
}
