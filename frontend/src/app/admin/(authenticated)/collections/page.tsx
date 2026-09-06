import { requireAdmin } from "@/lib/admin-auth";
import AdminCollectionsPage from "./AdminCollectionsPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdmin();
  return <AdminCollectionsPage />;
}
