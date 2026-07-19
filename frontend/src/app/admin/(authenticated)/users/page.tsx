import { requireAdmin } from "@/lib/admin-auth";
import UsersPage from "./UsersPage";

export default async function Page() {
  await requireAdmin();
  return <UsersPage />;
}
