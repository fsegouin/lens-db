import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import { getMountsWithFlange } from "@/lib/adapters";

export const revalidate = 86400;

export const metadata = {
  title: "Using the data",
  description:
    "A documented read API over the lens, camera and mount records, including the flange focal distances that decide what adapts onto what.",
  alternates: { canonical: "/developers" },
};

const ENDPOINTS: { method: string; path: string; what: string }[] = [
  { method: "GET", path: "/api/v1/lenses?limit=100&after=0", what: "Every lens, in id order." },
  { method: "GET", path: "/api/v1/lenses/{id}", what: "One lens. The id is the slug from its page URL." },
  { method: "GET", path: "/api/v1/cameras?limit=100&after=0", what: "Every camera body, in id order." },
  { method: "GET", path: "/api/v1/cameras/{id}", what: "One camera body." },
  { method: "GET", path: "/api/v1/mounts", what: "Every mount, with its flange focal distance." },
  {
    method: "GET",
    path: "/api/v1/adapt?from={mount}&to={mount}",
    what: "Whether that lens mount reaches infinity focus on that body mount, with both registers and the gap.",
  },
  {
    method: "GET",
    path: "/api/v1/dump?type=lenses",
    what: "The whole set as newline-delimited JSON, one record per line. Also cameras and mounts.",
  },
];

export default async function DevelopersPage() {
  const mounts = await getMountsWithFlange().catch(() => []);
  const withRegister = mounts.length;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Breadcrumb crumbs={[{ name: "Using the data" }]} />

      <h1 className="mt-4 text-3xl font-bold tracking-tight">Using the data</h1>

      <p className="mt-3 text-lg leading-relaxed">
        The records here are meant to be resolved against, not just read. There
        is a versioned read API over the lenses, the camera bodies and the
        mounts, and it needs no key and no account.
      </p>

      <p className="mt-4 leading-relaxed">
        The part worth having is the mounts. {withRegister} of them carry a
        flange focal distance, which is the one number that decides whether a
        lens can be adapted to a body, and it is otherwise scattered across
        forum posts and manufacturer PDFs. The{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">/adapt</code>{" "}
        endpoint answers the question directly and hands back the arithmetic so
        you can check it.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Endpoints</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {["", "Path", "What it returns"].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="border-b border-border bg-muted px-3 py-2 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ENDPOINTS.map((e) => (
              <tr key={e.path}>
                <td className="border-b border-border px-3 py-2 font-mono text-xs">
                  {e.method}
                </td>
                <td className="border-b border-border px-3 py-2">
                  <code className="font-mono text-xs">{e.path}</code>
                </td>
                <td className="border-b border-border px-3 py-2 text-muted-foreground">
                  {e.what}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-semibold">An example</h2>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-muted p-4 font-mono text-xs leading-relaxed">
        <code>{`$ curl "https://thelensdb.com/api/v1/adapt?from=canon-fd&to=sony-e"

{
  "from": { "id": "canon-fd", "name": "Canon FD", "flangeDistanceMm": 42 },
  "to":   { "id": "sony-e",   "name": "Sony E",   "flangeDistanceMm": 18 },
  "verdict": "adapts",
  "summary": "Adapts, with infinity focus",
  "adapterRoomMm": 24
}`}</code>
      </pre>

      <h2 className="mt-10 text-xl font-semibold">Taking all of it</h2>
      <p className="mt-3 leading-relaxed">
        Paging works and is the polite way to do it, but if you want the corpus
        you want one file:{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">
          /api/v1/dump?type=lenses
        </code>{" "}
        streams every record as newline-delimited JSON, one per line, and the
        same for{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">cameras</code>{" "}
        and{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">mounts</code>.
        The first line is a header naming the licence, so the terms travel with
        the file.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Paging</h2>
      <p className="mt-3 leading-relaxed">
        The list endpoints page by id rather than by offset:{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">after</code>{" "}
        takes the{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">nextAfter</code>{" "}
        from the previous response and stops when that comes back null. Records
        get merged into one another as duplicates are found, and an offset would
        skip rows underneath anyone walking the whole set.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Identifiers</h2>
      <p className="mt-3 leading-relaxed">
        The id of a record is the slug in its page URL, so{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">
          /api/v1/lenses/canon-fd-50mm-f14-1971
        </code>{" "}
        and{" "}
        <Link href="/lenses" className="underline underline-offset-2">
          the page for that lens
        </Link>{" "}
        name the same thing. When a duplicate is merged the surviving slug is
        the one that keeps working; the merged one redirects on the site and
        disappears from the API.
      </p>

      <h2 className="mt-10 text-xl font-semibold">What you may do with it</h2>
      <p className="mt-3 leading-relaxed">
        The factual records, meaning names, mounts, focal lengths, apertures,
        dates and flange distances, may be used freely with attribution to
        thelensdb.com. Corrections are welcome back:{" "}
        <Link href="/submit" className="underline underline-offset-2">
          submit
        </Link>{" "}
        anything that is wrong.
      </p>
      <p className="mt-3 leading-relaxed">
        Used prices are not in the API. They are derived from eBay completed
        listings, which this site may show but may not redistribute, so they
        stay on the pages.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Fair use</h2>
      <p className="mt-3 leading-relaxed">
        Responses are cached for an hour and there is no key to ask for. If you
        want the whole set, page through it once and keep it rather than
        refetching, and identify your client in the User-Agent so a problem can
        be traced to something other than an anonymous flood.
      </p>
    </div>
  );
}
