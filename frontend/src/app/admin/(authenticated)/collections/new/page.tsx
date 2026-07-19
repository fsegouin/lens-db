import CollectionForm from "@/components/admin/CollectionForm";
import { requireAdmin } from "@/lib/admin-auth";

export default async function NewCollectionPage() {
  await requireAdmin();
  return <div className="p-6"><CollectionForm /></div>;
}
