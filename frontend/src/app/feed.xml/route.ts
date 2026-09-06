import { getNewEntities, SITE_URL } from "@/lib/new-entities";

export const revalidate = 3600;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * RSS 2.0 of the last fifty things added to the catalogue. A feed reader is
 * the one place a reference site can be followed without an account.
 */
export async function GET() {
  const entries = (await getNewEntities().catch(() => [])).slice(0, 50);

  const items = entries
    .map((e) => {
      const url = `${SITE_URL}${e.href}`;
      const description = [
        [e.brand, e.name].filter(Boolean).join(" "),
        e.yearIntroduced ? `introduced ${e.yearIntroduced}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return [
        "<item>",
        `<title>${escapeXml(e.name)}</title>`,
        `<link>${escapeXml(url)}</link>`,
        `<guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `<pubDate>${new Date(e.createdAt).toUTCString()}</pubDate>`,
        `<category>${e.type}</category>`,
        `<description>${escapeXml(description)}</description>`,
        "</item>",
      ].join("");
    })
    .join("\n");

  const lastBuild = entries[0] ? new Date(entries[0].createdAt).toUTCString() : new Date().toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>The Lens DB: new in the catalogue</title>
<link>${SITE_URL}/new</link>
<atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
<description>Lenses and cameras recently added to The Lens DB.</description>
<language>en</language>
<lastBuildDate>${lastBuild}</lastBuildDate>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
