import { requireAdmin } from "@/lib/admin-auth";
import MergeReviewPage from "./MergeReviewPage";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  return <MergeReviewPage flagId={parseInt(id, 10)} />;
}
