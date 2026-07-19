import AdminTable from "@/components/admin/AdminTable";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminCollectionsPage() {
  await requireAdmin();

  return (
    <AdminTable
      title="Collections"
      apiPath="/api/admin/collections"
      editPath="/admin/collections"
      columns={[
        { key: "name", label: "Name", sortKey: "name" },
        { key: "lensCount", label: "Lenses", sortKey: "lensCount" },
        { key: "description", label: "Description" },
      ]}
      newHref="/admin/collections/new"
    />
  );
}
