import AdminTable from "@/components/admin/AdminTable";

export const dynamic = "force-dynamic";

const columns = [
  { key: "name", label: "Name", sortKey: "name" },
  { key: "systemName", label: "System", sortKey: "system" },
  { key: "sensorType", label: "Sensor", sortKey: "sensorType" },
  { key: "megapixels", label: "MP", sortKey: "megapixels" },
  { key: "yearIntroduced", label: "Year", sortKey: "year" },
  {
    key: "verified",
    label: "Status",
    render: (value: unknown) => (value === false ? "Unverified" : "Verified"),
  },
];

const filters = [
  {
    key: "verified",
    label: "Review status",
    options: [
      { label: "All", value: "" },
      { label: "Verified", value: "true" },
      { label: "Unverified", value: "false" },
    ],
  },
];

export default function AdminCamerasPage() {
  return (
    <AdminTable
      title="Cameras"
      apiPath="/api/admin/cameras"
      editPath="/admin/cameras"
      columns={columns}
      filters={filters}
      newHref="/admin/cameras/new"
    />
  );
}
