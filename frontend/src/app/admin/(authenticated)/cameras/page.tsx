import AdminTable from "@/components/admin/AdminTable";

export const dynamic = "force-dynamic";

const columns = [
  { key: "name", label: "Name" },
  { key: "systemName", label: "System" },
  { key: "sensorType", label: "Sensor" },
  { key: "megapixels", label: "MP" },
  { key: "yearIntroduced", label: "Year" },
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
