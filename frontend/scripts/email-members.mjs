// Writes to every real member, one short personal email each, asking what
// they came for. Dry run by default: prints who would get it and the text.
//
// From the repo root:
//   node --env-file=frontend/.env.local frontend/scripts/email-members.mjs
//   OUTREACH_REPLY_TO=you@thelensdb.com node --env-file=frontend/.env.local frontend/scripts/email-members.mjs --test=you@thelensdb.com
//   OUTREACH_REPLY_TO=you@thelensdb.com node --env-file=frontend/.env.local frontend/scripts/email-members.mjs --send
//
// --send goes through Resend from RESEND_FROM_EMAIL with OUTREACH_REPLY_TO as
// reply-to, so answers land in a read inbox, not noreply's. Members who never
// verified their address, banned accounts, admins and the DPReview Watcher
// bot are skipped. --test=address sends the copy personalised for that
// address to it alone; --only=handle restricts --send to one member.
import { Resend } from "resend";
import { createSql } from "./lib/db.mjs";

const args = new Set(process.argv.slice(2));
const SEND = args.has("--send");
const only = [...args].find((a) => a.startsWith("--only="))?.slice(7) ?? null;
const testTo = [...args].find((a) => a.startsWith("--test="))?.slice(7) ?? null;

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
  const joined = new Date(`${m.joined}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const edited =
    m.edit_count > 0
      ? " You are also one of the very few who have fixed something on the site already. Thank you for that."
      : "";
  const text = `Hi ${first},

I run The Lens DB. You joined back in ${joined}, and I have been meaning to write ever since.

I am building something I wish had existed when I started collecting lenses: one open place that knows every lens and every mount ever made, what fits what, and what people really paid for them. Not a shop, not a review farm, a reference built by the people who actually use the gear. And I want it to be a community, not just a database.

You are one of the earliest people to sign up, so I have one question for you: what brought you here, and what did you hope to do? One line is plenty. "Check which version of my Takumar this is", "list what I own", "see what a lens is worth", "honestly, I forgot". Every answer shapes what I build next.${edited}

Since you joined, a lot has changed. You can now record your kit and what you paid at https://thelensdb.com/kit, and publish it if you like. Every edit you make carries your name on the page. And there is a weekly note of new glass, if you want one.

Thanks for being here early. It matters more than you would think.

Florent
https://thelensdb.com`;
  return { subject: "What brought you to The Lens DB?", text };
}

console.log(`${members.length} member${members.length === 1 ? "" : "s"} ${SEND ? "to email" : "would be emailed"}:`);
for (const m of members) {
  console.log(`  ${m.display_name} <${m.email.replace(/^(.).*?(@.*)$/, "$1***$2")}> joined ${m.joined} edits=${m.edit_count} kit=${m.kit}`);
}

if (testTo) {
  if (!REPLY_TO) {
    console.error("Set OUTREACH_REPLY_TO first, so the test shows the real headers.");
    process.exit(1);
  }
  // Address the test to whoever receives it. The test address is usually an
  // alias the account was not registered under, so when no user carries it,
  // the copy is written for the admin, who is the person running this.
  const sql2 = createSql();
  const [me] = await sql2`
    SELECT display_name, to_char(created_at, 'YYYY-MM-DD') AS joined, edit_count
    FROM users
    WHERE email = ${testTo.toLowerCase().trim()} OR role = 'admin'
    ORDER BY (email = ${testTo.toLowerCase().trim()}) DESC, id
    LIMIT 1
  `;
  await sql2.end();
  if (!me) {
    console.error("No user matches that address and no admin account exists to write the test for.");
    process.exit(1);
  }
  const sample = me;
  const { subject, text } = draft(sample);
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({ from: FROM, to: testTo, replyTo: REPLY_TO, subject, text });
  if (error) {
    console.error(`test send failed: ${error.message}`);
    process.exit(1);
  }
  console.log(`Test copy sent to ${testTo.replace(/^(.).*?(@.*)$/, "$1***$2")}. No member was emailed.`);
  process.exit(0);
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
