import AdminTable from "@/components/admin/AdminTable";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminSeriesPage() {
  await requireAdmin();

  return (
    <AdminTable
      title="Lens Series"
      apiPath="/api/admin/series"
      editPath="/admin/series"
      columns={[
        { key: "name", label: "Name", sortKey: "name" },
        { key: "lensCount", label: "Lenses", sortKey: "lensCount" },
        { key: "description", label: "Description" },
      ]}
      newHref="/admin/series/new"
    />
  );
}
