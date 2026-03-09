import AdminTable from "@/components/admin/AdminTable";

export const dynamic = "force-dynamic";

export default function AdminSeriesPage() {
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
