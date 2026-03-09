import AdminTable from "@/components/admin/AdminTable";

export const dynamic = "force-dynamic";

export default function AdminCollectionsPage() {
  return (
    <AdminTable
      title="Collections"
      apiPath="/api/admin/collections"
      editPath="/admin/collections"
      columns={[
        { key: "name", label: "Name" },
        { key: "lensCount", label: "Lenses" },
        { key: "description", label: "Description" },
      ]}
      newHref="/admin/collections/new"
    />
  );
}
