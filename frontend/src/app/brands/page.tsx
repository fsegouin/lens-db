import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import { getBrands } from "@/lib/brands";

export const revalidate = 604800;

export const metadata = {
  title: "Lens brands",
  description:
    "Every lens maker in the database, from the majors to single-lens workshops, with how many lenses each made and when.",
  alternates: { canonical: "/brands" },
};

export default async function BrandsPage() {
  const brands = await getBrands().catch(() => []);

  // The long tail is mostly one-lens workshops; splitting keeps the index
  // scannable without hiding anything.
  const major = brands.filter((b) => b.lensCount >= 5);
  const tail = brands.filter((b) => b.lensCount < 5);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Breadcrumb crumbs={[{ name: "Lenses", path: "/lenses" }, { name: "Brands" }]} />

      <div className="mt-4">
        <h1 className="text-3xl font-bold tracking-tight">Lens brands</h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed">
          {brands.length.toLocaleString()} makers are recorded here, from the
          majors to workshops that produced a single lens.
        </p>
      </div>

      <div className="mt-8 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {major.map((brand) => (
          <Link
            key={brand.slug}
            href={`/brands/${brand.slug}`}
            className="flex items-baseline justify-between gap-3 border-b border-border py-2.5 transition-colors hover:bg-muted/50"
          >
            <span className="font-medium">{brand.name}</span>
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              {brand.lensCount.toLocaleString()}
            </span>
          </Link>
        ))}
      </div>

      {tail.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Fewer than five lenses
          </h2>
          <p className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-sm">
            {tail.map((brand) => (
              <Link
                key={brand.slug}
                href={`/brands/${brand.slug}`}
                className="underline-offset-2 hover:underline"
              >
                {brand.name}
              </Link>
            ))}
          </p>
        </div>
      )}
    </div>
  );
}
