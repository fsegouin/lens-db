import CompatibilityForm from "@/components/admin/CompatibilityForm";
import { requireAdmin } from "@/lib/admin-auth";

export default async function NewCompatibilityPage() {
  await requireAdmin();
  return <div className="p-6"><CompatibilityForm /></div>;
}
