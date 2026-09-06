import { Resend } from "resend";

/** Mask an email address for logging (avoid PII in logs): "florent@example.com" -> "f***@example.com" */
export function maskEmail(email: string): string {
  return email.replace(/^(.).*?(@.*)$/, "$1***$2");
}

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

/**
 * The public origin links in email should point at. A preview deployment
 * links to itself so a tester lands on the build that sent the message;
 * production links to the real domain.
 */
export function appUrl(): string {
  return process.env.VERCEL_ENV !== "production" && process.env.VERCEL_BRANCH_URL
    ? `https://${process.env.VERCEL_BRANCH_URL}`
    : process.env.APP_URL || "https://thelensdb.com";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** One frame for every message the site sends, so they read as one sender. */
function layout(title: string, bodyHtml: string): string {
  return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; color: #3f3f46;">
        <h1 style="font-size: 22px; font-weight: 700; color: #18181b; margin: 0 0 16px;">
          ${escapeHtml(title)}
        </h1>
        ${bodyHtml}
        <p style="font-size: 12px; color: #a1a1aa; margin-top: 40px; line-height: 1.5;">
          The Lens DB, ${appUrl()}
        </p>
      </div>
    `;
}

function paragraph(html: string): string {
  return `<p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">${html}</p>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display: inline-block; background: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; margin: 8px 0 16px;">${escapeHtml(label)}</a>`;
}

function link(href: string, label: string): string {
  return `<a href="${href}" style="color: #18181b; text-decoration: underline;">${escapeHtml(label)}</a>`;
}

function small(html: string): string {
  return `<p style="font-size: 13px; color: #71717a; line-height: 1.5; margin: 16px 0 0;">${html}</p>`;
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const fromEmail = process.env.RESEND_FROM_EMAIL || "The Lens DB <noreply@thelensdb.com>";
  // The welcome email invites a reply. Sent from noreply, that reply would
  // vanish, so route answers to a read inbox when one is configured.
  const replyTo = process.env.RESEND_REPLY_TO || undefined;
  const { error } = await getResend().emails.send({ from: fromEmail, to, subject, html, replyTo });
  if (error) {
    console.error(`[email] Failed to send "${subject}" to ${maskEmail(to)}:`, JSON.stringify(error));
    throw new Error(`Resend API error: ${error.message}`);
  }
}

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const verifyUrl = `${appUrl()}/api/auth/verify-email?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Verify your email, The Lens DB",
    html: layout(
      "Welcome to The Lens DB",
      paragraph("Click the button below to verify your email address and start contributing to the database.") +
        button(verifyUrl, "Verify email") +
        small("If you didn't create an account, you can safely ignore this email. This link expires in 24 hours.") +
        small(`Or copy this link: ${verifyUrl}`),
    ),
  });
}

/**
 * Sent once, the moment the address is verified. It is the only message that
 * says what an account is for, since the register form says it in two lines
 * and the verification email said nothing at all.
 */
export async function sendWelcomeEmail(email: string, displayName: string): Promise<void> {
  const base = appUrl();
  await sendEmail({
    to: email,
    subject: "You are in, The Lens DB",
    html: layout(
      `Hello ${displayName}`,
      paragraph("Your email is verified and your account works. Three things you can do now:") +
        paragraph(
          `${link(`${base}/kit`, "Record what you own")}. Publish it if you like, and it shows on every lens page you own, with what you paid if you choose to say.`,
        ) +
        paragraph(
          `${link(`${base}/lenses`, "Fix a spec")}. Every approved edit is credited to you on the page and on your profile.`,
        ) +
        paragraph(
          `${link(`${base}/new`, "See what is new")} in the catalogue. Weekly by email if you opt in on your kit page.`,
        ) +
        paragraph("If something is wrong or missing, reply to this email. I read every one.") +
        paragraph(`Florent<br>${link(base, "https://thelensdb.com")}`),
    ),
  });
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const resetUrl = `${appUrl()}/reset-password?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Reset your password, The Lens DB",
    html: layout(
      "Reset your password",
      paragraph("Someone asked to reset the password for this address. If that was you, choose a new one here:") +
        button(resetUrl, "Choose a new password") +
        small("If you did not ask for this, ignore the email and your password stays as it is. The link expires in one hour.") +
        small(`Or copy this link: ${resetUrl}`),
    ),
  });
}

export type EditReviewedEmail = {
  to: string;
  displayName: string;
  entityName: string;
  entityPath: string;
  entityType: string;
  entityId: number;
  summary: string;
};

export async function sendEditApprovedEmail(input: EditReviewedEmail): Promise<void> {
  const base = appUrl();
  const pageUrl = `${base}${input.entityPath}`;
  const historyUrl = `${base}/history/${input.entityType}/${input.entityId}`;
  await sendEmail({
    to: input.to,
    subject: `Your edit to ${input.entityName} is live`,
    html: layout(
      `Your edit to ${input.entityName} is live`,
      paragraph(`Hello ${escapeHtml(input.displayName)}, the change you proposed has been approved and is on the page now, credited to you.`) +
        paragraph(`<em>${escapeHtml(input.summary)}</em>`) +
        button(pageUrl, "See the page") +
        small(`The full history of this record is at ${link(historyUrl, historyUrl)}.`) +
        small("Thank you. Every corrected field makes the reference a little more trustworthy for the next person."),
    ),
  });
}

export async function sendEditRejectedEmail(
  input: EditReviewedEmail & { reason: string | null },
): Promise<void> {
  const base = appUrl();
  const pageUrl = `${base}${input.entityPath}`;
  await sendEmail({
    to: input.to,
    subject: `Your edit to ${input.entityName} was not applied`,
    html: layout(
      `About your edit to ${input.entityName}`,
      paragraph(`Hello ${escapeHtml(input.displayName)}, the change you proposed was reviewed and not applied.`) +
        paragraph(`<em>${escapeHtml(input.summary)}</em>`) +
        (input.reason
          ? paragraph(`The reviewer's note: ${escapeHtml(input.reason)}`)
          : paragraph("No reason was recorded. If you think the change was right, reply to this email with the source and it will be looked at again.")) +
        button(pageUrl, "Back to the page"),
    ),
  });
}
