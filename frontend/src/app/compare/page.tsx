import { Metadata } from "next";
import { Suspense } from "react";
import CompareClient from "./CompareClient";
import { PageTransition } from "@/components/page-transition";
import { TopBar } from "@/components/app-shell/top-bar";

export const metadata: Metadata = {
  title: "Compare | The Lens DB",
  description: "Compare lenses or cameras side by side.",
};

export default function ComparePage() {
  return (
    <PageTransition>
      <TopBar crumbs={[{ label: "home", href: "/" }, { label: "compare" }]}>
        <span>side by side</span>
      </TopBar>

      <div className="mx-auto w-full max-w-[1320px] px-6 pb-24 pt-10 lg:px-10">
        <Suspense>
          <CompareClient />
        </Suspense>
      </div>
    </PageTransition>
  );
}
