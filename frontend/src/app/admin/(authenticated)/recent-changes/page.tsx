import { requireAdmin } from "@/lib/admin-auth";
import RecentChangesPage from "./RecentChangesPage";

export default async function Page() {
  await requireAdmin();
  return <RecentChangesPage />;
}
