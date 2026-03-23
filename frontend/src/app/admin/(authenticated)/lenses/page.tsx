import AdminTable from "@/components/admin/AdminTable";

const columns = [
  { key: "name", label: "Name", sortKey: "name" },
  { key: "brand", label: "Brand", sortKey: "brand" },
  { key: "systemName", label: "System", sortKey: "system" },
  {
    key: "focalLengthMin",
    label: "Focal Length",
    sortKey: "focalLength",
    render: (_value: unknown, row: Record<string, unknown>) => {
      const min = row.focalLengthMin;
      const max = row.focalLengthMax;
      if (min == null && max == null) return "";
      if (min != null && max != null && min !== max) return `${min}-${max} mm`;
      return `${min ?? max} mm`;
    },
  },
  { key: "yearIntroduced", label: "Year", sortKey: "year" },
];

export default function AdminLensesPage() {
  return (
    <AdminTable
      title="Lenses"
      apiPath="/api/admin/lenses"
      editPath="/admin/lenses"
      columns={columns}
      newHref="/admin/lenses/new"
    />
  );
}
