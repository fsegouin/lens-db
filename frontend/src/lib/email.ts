import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export async function sendVerificationEmail(
  email: string,
  token: string
): Promise<void> {
  const appUrl = process.env.APP_URL || "https://thelensdb.com";
  const fromEmail = process.env.RESEND_FROM_EMAIL || "The Lens DB <noreply@thelensdb.com>";
  const verifyUrl = `${appUrl}/api/auth/verify-email?token=${token}`;

  await getResend().emails.send({
    from: fromEmail,
    to: email,
    subject: "Verify your email — The Lens DB",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 700; color: #18181b; margin-bottom: 16px;">
          Welcome to The Lens DB
        </h1>
        <p style="font-size: 16px; color: #3f3f46; line-height: 1.6; margin-bottom: 24px;">
          Click the button below to verify your email address and start contributing to the database.
        </p>
        <a href="${verifyUrl}" style="display: inline-block; background: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
          Verify Email
        </a>
        <p style="font-size: 13px; color: #71717a; margin-top: 32px; line-height: 1.5;">
          If you didn't create an account, you can safely ignore this email.
          This link expires in 24 hours.
        </p>
        <p style="font-size: 13px; color: #a1a1aa; margin-top: 16px;">
          Or copy this link: ${verifyUrl}
        </p>
      </div>
    `,
  });
}
