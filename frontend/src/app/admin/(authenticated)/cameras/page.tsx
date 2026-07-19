import { requireAdmin } from "@/lib/admin-auth";
import AdminCamerasPage from "./AdminCamerasPage";

export default async function Page() {
  await requireAdmin();
  return <AdminCamerasPage />;
}
