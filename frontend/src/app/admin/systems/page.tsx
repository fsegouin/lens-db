import AdminTable from "@/components/admin/AdminTable";

export const dynamic = "force-dynamic";

export default function AdminSystemsPage() {
  return (
    <AdminTable
      title="Systems"
      apiPath="/api/admin/systems"
      editPath="/admin/systems"
      columns={[
        { key: "name", label: "Name" },
        { key: "manufacturer", label: "Manufacturer" },
        { key: "mountType", label: "Mount Type" },
      ]}
      newHref="/admin/systems/new"
    />
  );
}
