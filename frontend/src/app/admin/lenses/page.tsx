import AdminTable from "@/components/admin/AdminTable";

export const dynamic = "force-dynamic";

const columns = [
  { key: "name", label: "Name" },
  { key: "brand", label: "Brand" },
  { key: "systemName", label: "System" },
  {
    key: "focalLengthMin",
    label: "Focal Length",
    render: (_value: unknown, row: Record<string, unknown>) => {
      const min = row.focalLengthMin;
      const max = row.focalLengthMax;
      if (min == null && max == null) return "";
      if (min != null && max != null && min !== max) return `${min}-${max} mm`;
      return `${min ?? max} mm`;
    },
  },
  { key: "yearIntroduced", label: "Year" },
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
