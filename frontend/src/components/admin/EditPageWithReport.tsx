import { Suspense } from "react";
import ReportPanel from "./ReportPanel";

export default function EditPageWithReport({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-6 p-6">
      <div className="min-w-0 flex-1 space-y-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {title}
        </h1>
        {children}
      </div>
      <Suspense>
        <ReportSidebar />
      </Suspense>
    </div>
  );
}

function ReportSidebar() {
  return (
    <div className="hidden w-80 shrink-0 lg:block">
      <div className="sticky top-4">
        <ReportPanel />
      </div>
    </div>
  );
}
