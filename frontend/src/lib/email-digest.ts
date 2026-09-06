import { Resend } from "resend";
import { SITE_URL, type NewEntity } from "@/lib/new-entities";

/**
 * The weekly "new glass" email. Built here rather than in email.ts so the
 * digest can be assembled and previewed without touching the account mails.
 */

const MAX_LISTED = 30;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function itemHtml(e: NewEntity): string {
  const meta = [e.brand, e.yearIntroduced].filter(Boolean).map(String).map(escapeHtml).join(", ");
  return `<li style="margin: 0 0 8px 0;">
    <a href="${SITE_URL}${e.href}" style="color: #18181b; font-weight: 600; text-decoration: none;">${escapeHtml(e.name)}</a>${meta ? `<span style="color: #71717a;"> ${meta}</span>` : ""}
  </li>`;
}

function sectionHtml(title: string, entries: NewEntity[]): string {
  if (entries.length === 0) return "";
  return `
    <h2 style="font-size: 13px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: #71717a; margin: 24px 0 8px;">${title}</h2>
    <ul style="list-style: none; padding: 0; margin: 0; font-size: 15px; line-height: 1.5;">
      ${entries.map(itemHtml).join("\n")}
    </ul>`;
}

export function buildDigestEmail(
  entries: NewEntity[],
  weekLabel: string,
): { subject: string; html: string } {
  const lensCount = entries.filter((e) => e.type === "lens").length;
  const cameraCount = entries.length - lensCount;

  const countLine = [
    lensCount > 0 ? `${lensCount} ${lensCount === 1 ? "lens" : "lenses"}` : null,
    cameraCount > 0 ? `${cameraCount} ${cameraCount === 1 ? "camera" : "cameras"}` : null,
  ]
    .filter(Boolean)
    .join(" and ");

  // Keep the email readable: the page has the full list.
  const listed = entries.slice(0, MAX_LISTED);
  const lensesListed = listed.filter((e) => e.type === "lens");
  const camerasListed = listed.filter((e) => e.type === "camera");
  const remaining = entries.length - listed.length;

  const subject = `New in the catalogue, ${weekLabel}: ${countLine}`;

  const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 700; color: #18181b; margin-bottom: 16px;">
          New in the catalogue
        </h1>
        <p style="font-size: 16px; color: #3f3f46; line-height: 1.6; margin-bottom: 8px;">
          ${escapeHtml(countLine)} added in the week to ${escapeHtml(weekLabel)}.
        </p>
        ${sectionHtml("Lenses", lensesListed)}
        ${sectionHtml("Cameras", camerasListed)}
        ${
          remaining > 0
            ? `<p style="font-size: 14px; color: #3f3f46; margin-top: 16px;">And ${remaining} more on the site.</p>`
            : ""
        }
        <a href="${SITE_URL}/new" style="display: inline-block; margin-top: 24px; background: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
          See everything new
        </a>
        <p style="font-size: 13px; color: #71717a; margin-top: 32px; line-height: 1.5;">
          You get this because you ticked the box on your
          <a href="${SITE_URL}/kit" style="color: #71717a;">kit page</a>.
          Untick it there to stop.
        </p>
      </div>
    `;

  return { subject, html };
}

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export async function sendDigestEmail(
  to: string,
  { subject, html }: { subject: string; html: string },
): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL || "The Lens DB <noreply@thelensdb.com>";
  const { error } = await getResend().emails.send({ from, to, subject, html });
  if (error) throw new Error(`Resend API error: ${error.message}`);
}
