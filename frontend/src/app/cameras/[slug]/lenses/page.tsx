import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import JsonLd from "@/components/JsonLd";
import { getCameraBySlug, getCameraSlugById } from "@/lib/cameras";
import { getLensesForMount, type FittingLens } from "@/lib/camera-lenses";
import { entityMetadata } from "@/lib/seo";
import { hubJsonLd } from "@/lib/jsonld";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const revalidate = 604800;

export async function generateStaticParams() {
  return [];
}

function focalLabel(lens: FittingLens): string {
  if (lens.focalLengthMin == null) return "—";
  return lens.focalLengthMax != null && lens.focalLengthMax !== lens.focalLengthMin
    ? `${lens.focalLengthMin}-${lens.focalLengthMax}mm`
    : `${lens.focalLengthMin}mm`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getCameraBySlug(slug);
  if (!result) return { title: "Camera Not Found" };

  const { camera, system } = result;
  const lenses = await getLensesForMount(camera.systemId);

  return entityMetadata({
    title: `Lenses for the ${camera.name}`,
    description:
      `Every lens that fits the ${camera.name}: ${lenses.length.toLocaleString()} lenses made for the ` +
      `${system?.name ?? "same"} mount, with focal length, maximum aperture, weight and release year.`,
    path: `/cameras/${camera.slug}/lenses`,
  });
}

export default async function CameraLensesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getCameraBySlug(slug);
  if (!result) notFound();

  const { camera, system } = result;
  if (camera.mergedIntoId) {
    const targetSlug = await getCameraSlugById(camera.mergedIntoId);
    if (targetSlug) permanentRedirect(`/cameras/${targetSlug}/lenses`);
  }

  const fitting = await getLensesForMount(camera.systemId);

  const crumbs = [
    { name: "Cameras", path: "/cameras" },
    { name: camera.name, path: `/cameras/${camera.slug}` },
    { name: "Lenses" },
  ];

  const primes = fitting.filter((l) => !l.isZoom).length;
  const zooms = fitting.filter((l) => l.isZoom).length;
  const autofocus = fitting.filter((l) => l.hasAutofocus).length;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <JsonLd
        data={hubJsonLd({
          path: `/cameras/${camera.slug}/lenses`,
          name: `Lenses for the ${camera.name}`,
          description: `Lenses made for the ${system?.name ?? "camera's"} mount.`,
          items: fitting.map((l) => ({ name: l.name, path: `/lenses/${l.slug}` })),
          crumbs,
        })}
      />

      <Breadcrumb crumbs={crumbs} />

      <div className="mt-4">
        <h1 className="text-3xl font-bold tracking-tight text-balance">
          Lenses for the {camera.name}
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed">
          {system ? (
            <>
              The {camera.name} takes the{" "}
              <Link
                href={`/systems/${system.slug}`}
                className="underline underline-offset-2"
              >
                {system.name}
              </Link>{" "}
              mount. {fitting.length.toLocaleString()} lenses in the database were
              made for it.
            </>
          ) : (
            <>No mount is recorded for the {camera.name}, so its lenses cannot be
            listed yet.</>
          )}
        </p>
        {fitting.length > 0 && (
          <p className="mt-2 font-mono text-sm tabular-nums text-muted-foreground">
            {primes.toLocaleString()} prime · {zooms.toLocaleString()} zoom ·{" "}
            {autofocus.toLocaleString()} autofocus
          </p>
        )}
      </div>

      {fitting.length > 0 ? (
        <>
          {/* Cards on a phone, the table from lg up, as on the lens list. */}
          <ul className="mt-8 divide-y divide-border border-y border-border lg:hidden">
            {fitting.map((lens) => (
              <li key={lens.id}>
                <Link
                  href={`/lenses/${lens.slug}`}
                  className="flex flex-col gap-1.5 py-3 transition-colors hover:bg-muted/50"
                >
                  <span className="font-medium leading-snug">{lens.name}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {[
                      focalLabel(lens),
                      lens.apertureMin ? `f/${lens.apertureMin}` : null,
                      lens.weightG ? `${lens.weightG}g` : null,
                      lens.yearIntroduced,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-8 hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col">Brand</TableHead>
                  <TableHead scope="col">Focal length</TableHead>
                  <TableHead scope="col">Aperture</TableHead>
                  <TableHead scope="col">Weight</TableHead>
                  <TableHead scope="col">Year</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fitting.map((lens) => (
                  <TableRow key={lens.id}>
                    <TableCell className="max-w-[24rem] whitespace-normal">
                      <Link
                        href={`/lenses/${lens.slug}`}
                        className="font-medium hover:underline"
                      >
                        {lens.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {lens.brand ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {focalLabel(lens)}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {lens.apertureMin ? `f/${lens.apertureMin}` : "—"}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {lens.weightG ? `${lens.weightG}g` : "—"}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {lens.yearIntroduced ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {system && (
            <p className="mt-6 text-sm">
              <Link
                href={`/lenses?system=${encodeURIComponent(system.slug)}`}
                className="underline underline-offset-2"
              >
                Filter these {system.name} lenses by focal length, aperture and price →
              </Link>
            </p>
          )}
        </>
      ) : (
        <p className="mt-8 rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
          No lenses are recorded for this mount yet.
        </p>
      )}

      {/* Only native fit is shown: adapted combinations need mount register
          data the systems table does not carry yet. */}
      <p className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
        Native fit only. Lenses from other mounts may fit with an adapter, which
        this database does not model yet.
      </p>
    </div>
  );
}
