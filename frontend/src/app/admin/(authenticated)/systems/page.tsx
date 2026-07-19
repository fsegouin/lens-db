import AdminTable from "@/components/admin/AdminTable";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminSystemsPage() {
  await requireAdmin();

  return (
    <AdminTable
      title="Systems"
      apiPath="/api/admin/systems"
      editPath="/admin/systems"
      columns={[
        { key: "name", label: "Name", sortKey: "name" },
        { key: "manufacturer", label: "Manufacturer", sortKey: "manufacturer" },
        { key: "mountType", label: "Mount Type", sortKey: "mountType" },
      ]}
      newHref="/admin/systems/new"
    />
  );
}
