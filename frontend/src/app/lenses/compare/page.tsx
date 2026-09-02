import { permanentRedirect } from "next/navigation";

export default async function LegacyComparePage({
  searchParams,
}: {
  searchParams: Promise<{ lens1?: string; lens2?: string }>;
}) {
  const { lens1, lens2 } = await searchParams;
  const params = new URLSearchParams();
  if (lens1 || lens2) {
    params.set("type", "lens");
    if (lens1) params.set("lens1", lens1);
    if (lens2) params.set("lens2", lens2);
  }
  const qs = params.toString();
  permanentRedirect(qs ? `/compare?${qs}` : "/compare");
}
