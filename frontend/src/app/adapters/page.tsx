import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import { adaptVerdict, getAdapterMatrix } from "@/lib/adapters";

export const revalidate = 604800;

export const metadata = {
  title: "Adapting lenses between mounts",
  description:
    "Which lens mounts adapt onto which camera bodies, worked out from each mount's flange focal distance rather than folklore.",
  alternates: { canonical: "/adapters" },
};

export default async function AdaptersPage() {
  const { mounts, sources, targets } = await getAdapterMatrix().catch(() => ({
    mounts: [],
    sources: [],
    targets: [],
  }));

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Breadcrumb crumbs={[{ name: "Adapting" }]} />

      <div className="mt-4">
        <h1 className="text-3xl font-bold tracking-tight">
          Adapting lenses between mounts
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed">
          A plain adapter is a spacer: it can only add distance between the lens
          and the sensor. So old glass reaches infinity focus on a new body when
          its own mount sits further from the film plane than the body&rsquo;s
          does. {mounts.length} mounts here have a recorded register, which is
          enough to answer the question by arithmetic instead of folklore.
        </p>
      </div>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Which lens mounts adapt onto which bodies
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="border-b border-border bg-muted px-3 py-2 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase"
              >
                Lens mount
              </th>
              {targets.map((t) => (
                <th
                  key={t.slug}
                  scope="col"
                  className="border-b border-border bg-muted px-2 py-2 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase"
                >
                  {t.name}
                  <span className="block font-mono text-[10px] normal-case tracking-normal">
                    {t.flangeDistanceMm} mm
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.map((from) => (
              <tr key={from.slug}>
                <th
                  scope="row"
                  className="border-b border-border px-3 py-2 text-left font-medium"
                >
                  <Link href={`/systems/${from.slug}`} className="hover:underline">
                    {from.name}
                  </Link>
                  <span className="ml-2 font-mono text-xs tabular-nums text-muted-foreground">
                    {from.flangeDistanceMm}
                  </span>
                </th>
                {targets.map((to) => {
                  const v = adaptVerdict(from, to);
                  const mark =
                    v.kind === "native" ? "native"
                    : v.kind === "adapts" ? "yes"
                    : v.kind === "tight" ? "tight"
                    : v.kind === "optics" ? "no"
                    : "unknown";
                  const tone =
                    v.kind === "adapts" ? "text-[color:var(--ok)]"
                    : v.kind === "optics" ? "text-muted-foreground"
                    : v.kind === "tight" ? "text-[color:var(--warn)]"
                    : "text-muted-foreground";
                  return (
                    <td key={to.slug} className="border-b border-border px-2 py-2">
                      {from.id === to.id ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          native
                        </span>
                      ) : (
                        <Link
                          href={`/adapters/${from.slug}-to-${to.slug}`}
                          className={`font-mono text-xs hover:underline ${tone}`}
                        >
                          {mark}
                        </Link>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 max-w-2xl text-sm text-muted-foreground">
        <strong className="font-semibold text-foreground">yes</strong> means a
        plain adapter reaches infinity focus.{" "}
        <strong className="font-semibold text-foreground">tight</strong> means
        the registers differ by less than an adapter can usually be built to.{" "}
        <strong className="font-semibold text-foreground">no</strong> means a
        plain adapter cannot reach infinity, and corrective glass would be
        needed. None of this accounts for whether an adapter is actually sold,
        for electronic contacts, or for mirror clearance.
      </p>
    </div>
  );
}
