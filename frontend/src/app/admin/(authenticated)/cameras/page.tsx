import AdminTable from "@/components/admin/AdminTable";

export const dynamic = "force-dynamic";

const columns = [
  { key: "name", label: "Name", sortKey: "name" },
  { key: "systemName", label: "System", sortKey: "system" },
  { key: "sensorType", label: "Sensor", sortKey: "sensorType" },
  { key: "megapixels", label: "MP", sortKey: "megapixels" },
  { key: "yearIntroduced", label: "Year", sortKey: "year" },
];

export default function AdminCamerasPage() {
  return (
    <AdminTable
      title="Cameras"
      apiPath="/api/admin/cameras"
      editPath="/admin/cameras"
      columns={columns}
      newHref="/admin/cameras/new"
    />
  );
}
