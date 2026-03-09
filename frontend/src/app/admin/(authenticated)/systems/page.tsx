import AdminTable from "@/components/admin/AdminTable";

export const dynamic = "force-dynamic";

export default function AdminSystemsPage() {
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
