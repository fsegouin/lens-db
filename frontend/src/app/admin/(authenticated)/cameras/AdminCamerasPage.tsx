"use client";

import AdminTable from "@/components/admin/AdminTable";
import { useBulkCameraActions } from "@/components/admin/BulkCameraActions";

const columns = [
  { key: "name", label: "Name", sortKey: "name" },
  { key: "systemName", label: "System", sortKey: "system" },
  { key: "sensorType", label: "Sensor", sortKey: "sensorType" },
  { key: "megapixels", label: "MP", sortKey: "megapixels" },
  { key: "yearIntroduced", label: "Year", sortKey: "year" },
];

const filters = [
  { key: "missing_images", label: "Show cameras with missing images", type: "checkbox" as const },
];

export default function AdminCamerasPage() {
  const { bulkActions, modalElement } = useBulkCameraActions();

  return (
    <>
      <AdminTable
        title="Cameras"
        apiPath="/api/admin/cameras"
        editPath="/admin/cameras"
        columns={columns}
        filters={filters}
        newHref="/admin/cameras/new"
        bulkActions={bulkActions}
      />
      {modalElement}
    </>
  );
}
