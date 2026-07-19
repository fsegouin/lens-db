import SystemForm from "@/components/admin/SystemForm";
import { requireAdmin } from "@/lib/admin-auth";

export default async function NewSystemPage() {
  await requireAdmin();
  return <div className="p-6"><SystemForm /></div>;
}
