// Writes to every real member, one short personal email each, asking what
// they came for. Dry run by default: prints who would get it and the text.
//
//   bash -c 'set -a; source .env.local; set +a; node scripts/email-members.mjs'
//   bash -c 'set -a; source .env.local; set +a; node scripts/email-members.mjs --send'
//
// --send goes through Resend from RESEND_FROM_EMAIL with your address as
// reply-to, so answers land in your inbox, not noreply's. Members who never
// verified their address, banned accounts, admins and the DPReview Watcher
// bot are skipped. Pass --only=handle to send to one person first.
import { Resend } from "resend";
import { createSql } from "./lib/db.mjs";

const args = new Set(process.argv.slice(2));
const SEND = args.has("--send");
const only = [...args].find((a) => a.startsWith("--only="))?.slice(7) ?? null;

const FROM = process.env.RESEND_FROM_EMAIL || "The Lens DB <noreply@thelensdb.com>";
// Replies must reach a real inbox. There is no default on purpose: sending 34
// personal emails whose answers bounce off noreply would be worse than not
// sending them.
const REPLY_TO = process.env.OUTREACH_REPLY_TO;
if (SEND && !REPLY_TO) {
  console.error("Set OUTREACH_REPLY_TO to the address replies should go to, then re-run with --send.");
  process.exit(1);
}

const sql = createSql();
const members = await sql`
  SELECT id, display_name, handle, email, to_char(created_at, 'YYYY-MM-DD') AS joined, edit_count,
         (SELECT count(*)::int FROM kit_items k WHERE k.user_id = u.id) AS kit
  FROM users u
  WHERE role = 'user'
    AND is_banned = false
    AND email_verified_at IS NOT NULL
    AND display_name <> 'DPReview Watcher'
    ${only ? sql`AND handle = ${only}` : sql``}
  ORDER BY created_at
`;
await sql.end();

function draft(m) {
  const first = m.display_name.split(/[\s_-]/)[0];
  const did =
    m.edit_count > 0
      ? `You made ${m.edit_count} ${m.edit_count === 1 ? "edit" : "edits"}, which puts you among the very few people who have.`
      : "You created an account and, as far as I can tell, never found anything worth doing with it. That is on me, not you.";
  const text = `Hi ${first},

I run The Lens DB. You signed up in ${new Date(`${m.joined}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}. ${did}

I am writing to the ${members.length} people who have accounts, one by one, with a single question: what did you come to the site for, and what did you want to do once you were there?

A reply of one line is plenty. "I wanted to check which version of a lens I had", "I wanted to list what I own", "I was looking for a price", "I forgot". All of it helps me decide what to build next.

Since you joined, a few things have changed. You can now record what you own and what you paid for it, and publish it if you like, at https://thelensdb.com/kit. Every edit you make is credited to you by name on the page. And there is a weekly note of what is new in the catalogue if you want one, from the same kit page.

Thanks for reading this far.

Florent
https://thelensdb.com`;
  return { subject: "One question about The Lens DB", text };
}

console.log(`${members.length} member${members.length === 1 ? "" : "s"} ${SEND ? "to email" : "would be emailed"}:`);
for (const m of members) {
  console.log(`  ${m.display_name} <${m.email.replace(/^(.).*?(@.*)$/, "$1***$2")}> joined ${m.joined} edits=${m.edit_count} kit=${m.kit}`);
}

if (!SEND) {
  const sample = members[0];
  if (sample) {
    console.log("\nSample email (first member):\n");
    console.log(draft(sample).text);
  }
  console.log("\nDry run. Re-run with --send to send.");
  process.exit(0);
}

const resend = new Resend(process.env.RESEND_API_KEY);
let sent = 0;
for (const m of members) {
  const { subject, text } = draft(m);
  const { error } = await resend.emails.send({ from: FROM, to: m.email, replyTo: REPLY_TO, subject, text });
  if (error) {
    console.error(`  failed ${m.display_name}: ${error.message}`);
    continue;
  }
  sent++;
  console.log(`  sent to ${m.display_name}`);
  // Resend's free tier allows two requests a second; do not race it.
  await new Promise((r) => setTimeout(r, 600));
}
console.log(`\nSent ${sent} of ${members.length}.`);
