import { requireAdmin } from "@/lib/admin-auth";
import UserDetailPage from "./UserDetailPage";

export default async function Page() {
  await requireAdmin();
  return <UserDetailPage />;
}
