import { requireAdmin } from "@/lib/admin-auth";
import PendingEditsPage from "./PendingEditsPage";

export default async function Page() {
  await requireAdmin();
  return <PendingEditsPage />;
}
