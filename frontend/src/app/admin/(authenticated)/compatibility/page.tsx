import { requireAdmin } from "@/lib/admin-auth";
import AdminCompatibilityPage from "./AdminCompatibilityPage";

export default async function Page() {
  await requireAdmin();
  return <AdminCompatibilityPage />;
}
