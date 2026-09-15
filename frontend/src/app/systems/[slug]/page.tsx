import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import JsonLd from "@/components/JsonLd";
import { entityMetadata, metaDescription } from "@/lib/seo";
import { hubJsonLd } from "@/lib/jsonld";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { systemRedirects, systems } from "@/db/schema";
import { getSystemCameras, getSystemLenses } from "@/lib/hub-lists";
import ViewTracker from "@/components/ViewTracker";
import MountCatalogue from "@/components/MountCatalogue";
import { Badge } from "@/components/ui/badge";

export const revalidate = 604800;

export async function generateStaticParams() {
  if (process.env.VERCEL_ENV !== "production") return [];
  const rows = await db.select({ slug: systems.slug }).from(systems);
  return rows.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [result] = await db
    .select({ system: systems })
    .from(systems)
    .where(eq(systems.slug, slug))
    .limit(1);

  if (!result) return { title: "System Not Found" };

  const { system } = result;
  return entityMetadata({
    title: `${system.name} lenses and cameras`,
    description:
      system.description ? metaDescription(system.description) :
      `Every lens and camera body made for the ${system.name} mount, with specifications, release years and used prices.`,
    path: `/systems/${system.slug}`,
  });
}

export default async function SystemDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [result] = await db
    .select({ system: systems })
    .from(systems)
    .where(eq(systems.slug, slug))
    .limit(1);

  if (!result) {
    // Merged-away system (see scripts/consolidate-systems.mjs): follow the
    // slug redirect so old links and search results still land somewhere.
    const [target] = await db
      .select({ slug: systems.slug })
      .from(systemRedirects)
      .innerJoin(systems, eq(systemRedirects.systemId, systems.id))
      .where(eq(systemRedirects.oldSlug, slug))
      .limit(1);
    if (target) permanentRedirect(`/systems/${target.slug}`);
    notFound();
  }

  const { system } = result;

  const [systemLenses, systemCameras] = await Promise.all([
    getSystemLenses(system.id),
    getSystemCameras(system.id),
  ]);

  const crumbs = [
    { name: "Systems", path: "/systems" },
    { name: system.name },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <JsonLd
        data={hubJsonLd({
          path: `/systems/${system.slug}`,
          name: `${system.name} lenses and cameras`,
          description: system.description,
          items: systemLenses.map((l) => ({
            name: l.name,
            path: `/lenses/${l.slug}`,
          })),
          crumbs,
        })}
      />

      <Breadcrumb crumbs={crumbs} />

      <div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{system.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {system.manufacturer && <Badge variant="outline">{system.manufacturer}</Badge>}
          {system.mountType && <Badge variant="system">{system.mountType}</Badge>}
          <Badge variant="secondary">
            {systemLenses.length} lenses, {systemCameras.length} cameras
          </Badge>
          {system.flangeDistanceMm != null && (
            <Badge variant="outline">
              {system.flangeDistanceMm} mm register
            </Badge>
          )}
          {system.wikidataQid && (
            <a
              href={`https://www.wikidata.org/wiki/${system.wikidataQid}`}
              rel="noopener noreferrer external"
              target="_blank"
              className="font-mono text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
              title="This mount on Wikidata"
              aria-label={`${system.wikidataQid} on Wikidata, opens in a new tab`}
            >
              {system.wikidataQid}
            </a>
          )}
          {(system.viewCount ?? 0) > 0 && (
            <span className="text-muted-foreground">{(system.viewCount ?? 0).toLocaleString()} views</span>
          )}
        </div>
      </div>

      {system.description && <p className="leading-relaxed text-muted-foreground">{system.description}</p>}

      {system.flangeDistanceMm != null && (
        <p className="text-sm">
          <Link href="/adapters" className="underline underline-offset-2">
            What adapts onto {system.name}, and what {system.name} lenses adapt onto →
          </Link>
        </p>
      )}

      <MountCatalogue
        systemSlug={system.slug}
        systemName={system.name}
        lenses={systemLenses}
        cameras={systemCameras}
      />

      <ViewTracker type="system" id={system.id} />
    </div>
  );
}
