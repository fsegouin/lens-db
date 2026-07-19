import { requireAdmin } from "@/lib/admin-auth";
import AdminLensesPage from "./AdminLensesPage";

export default async function Page() {
  await requireAdmin();
  return <AdminLensesPage />;
}
