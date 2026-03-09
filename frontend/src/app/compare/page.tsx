import { Metadata } from "next";
import { Suspense } from "react";
import CompareClient from "./CompareClient";
import { PageTransition } from "@/components/page-transition";

export const metadata: Metadata = {
  title: "Compare | Lens DB",
  description: "Compare lenses or cameras side by side.",
};

export default function ComparePage() {
  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            Compare
          </h1>
          <p className="mt-2 text-zinc-500 dark:text-zinc-400">
            Search for a lens or camera to start comparing specifications side by
            side.
          </p>
        </div>
        <Suspense>
          <CompareClient />
        </Suspense>
      </div>
    </PageTransition>
  );
}
