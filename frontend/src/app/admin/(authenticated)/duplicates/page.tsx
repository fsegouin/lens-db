import { requireAdmin } from "@/lib/admin-auth";
import DuplicatesPage from "./DuplicatesPage";

export default async function Page() {
  await requireAdmin();
  return <DuplicatesPage />;
}
