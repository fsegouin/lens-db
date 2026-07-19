import SeriesForm from "@/components/admin/SeriesForm";
import { requireAdmin } from "@/lib/admin-auth";

export default async function NewSeriesPage() {
  await requireAdmin();
  return <div className="p-6"><SeriesForm /></div>;
}
