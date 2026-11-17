import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import { chatEnabled } from "@/proxy";

export const metadata = {
  title: "Privacy",
  description:
    "What The Lens DB stores about its visitors and members, who else handles it, how long it is kept, and how to have it removed.",
  alternates: { canonical: "/privacy" },
};

const CONTACT = "contact@thelensdb.com";

const linkClass = "underline underline-offset-2";
const headingClass = "mt-10 text-xl font-semibold";
const paragraphClass = "mt-4 leading-relaxed";
const listClass = "mt-4 list-disc space-y-2 pl-5 leading-relaxed";

function Contact() {
  return (
    <a href={`mailto:${CONTACT}`} className={linkClass}>
      {CONTACT}
    </a>
  );
}

export default function PrivacyPage() {
  // Switched off, the chat sends nothing anywhere, so the page says nothing of it.
  const chatOn = chatEnabled();
  return (
    <div className="mx-auto w-full max-w-3xl text-pretty">
      <Breadcrumb crumbs={[{ name: "Privacy" }]} />

      <h1 className="mt-4 text-3xl font-bold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated 17 November 2026</p>

      <p className="mt-3 text-lg leading-relaxed">
        The Lens DB is a reference site run by one person. It keeps as little
        about you as it can: nothing is sold, there is no advertising network,
        and this site sets no cookie that follows you from site to site.
      </p>
      <p className={paragraphClass}>
        This page says what is stored, why, who else handles it and how to have
        it removed. For anything it leaves unanswered, write to <Contact />.
      </p>

      <h2 className={headingClass}>If you only browse</h2>
      <ul className={listClass}>
        <li>
          <strong>Statistics.</strong> Page views and a few actions (a search
          and the words searched for, a filter and its value, a click on a
          listing) are counted with Vercel Web Analytics and Speed Insights.
          They set no cookie, do not identify you, and cannot follow you to
          another site.
        </li>
        <li>
          <strong>Security.</strong> Like any web server, the hosting provider
          sees your IP address and browser details when a page is requested. A
          firewall uses them to tell people from bots, and short-lived counters
          per address limit how fast one visitor can call the site. An address
          that abuses the site may be blocked.
        </li>
        <li>
          <strong>Ratings.</strong> Rating a lens or a camera needs no account.
          To keep one rating per visitor, the rating is stored with a salted
          hash of your IP address, not the address itself.
        </li>
        <li>
          <strong>Your browser.</strong> The light or dark theme you choose is
          remembered in your browser, and a marker that lasts until you close
          the tab keeps a page from being counted twice. Neither is sent to us
          as an identifier.
        </li>
      </ul>

      <h2 className={headingClass}>If you create an account</h2>
      <ul className={listClass}>
        <li>
          <strong>What you give.</strong> An email address, a display name and a
          password. The password is stored only as a salted hash that cannot be
          read back.
        </li>
        <li>
          <strong>Signing in.</strong> One cookie, <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">user_session</code>,
          keeps you signed in for 30 days. Scripts on the page cannot read it,
          and it is used for nothing else.
        </li>
        <li>
          <strong>Email.</strong> We write to confirm your address, to welcome
          you, to reset a password when you ask, and to tell you what became of
          an edit you proposed. A weekly digest of new entries is sent only if
          you turn it on, and you can turn it off again from your kit page.
        </li>
        <li>
          <strong>Your kit.</strong> The lenses and cameras you add, and what
          you choose to note about each: quantity, condition, serial number,
          year and price of purchase, notes. Your kit is private until you
          publish it. Publishing shows the items on your profile page, with
          how many you have, their condition and the year you bought them;
          the prices you paid appear only if you also choose to share them.
          Serial numbers and notes are never shown.
        </li>
        <li>
          <strong>Your profile.</strong> Your display name has a public page
          showing the month you joined, the changes you made to the catalogue
          and, once published, your kit.
        </li>
      </ul>

      <h2 className={headingClass}>If you contribute</h2>
      <p className={paragraphClass}>
        An edit you make to a lens, a camera or a mount is published in the{" "}
        <Link href="/changes" className={linkClass}>
          change history
        </Link>{" "}
        under your display name, with the date and what changed. Edits and
        submissions are also stored with a salted hash of your IP address, so
        that abuse can be traced and undone. That hash is never shown.
      </p>

      <h2 className={headingClass}>If you connect another app</h2>
      <p className={paragraphClass}>
        Some apps, such as ONI, can read and edit your kit once you allow it on
        a screen that names the app and what it asks for.
      </p>
      <ul className={listClass}>
        <li>
          <strong>What the app receives.</strong> Your display name and the list
          of lenses and cameras in your kit, as they appear in the public
          catalogue. It never receives your email address, your password, or
          the details you recorded about an item: quantity, condition, serial
          number, purchase year and price, notes.
        </li>
        <li>
          <strong>What the app can change.</strong> It can add items to your kit
          and remove them. Removing an item also deletes what you had noted
          about it.
        </li>
        <li>
          <strong>What we keep.</strong> For each connection, when it was made
          and when it was last used. We receive nothing about what you do in the
          app: no photos, no files, no usage.
        </li>
        <li>
          <strong>Ending it.</strong> You can disconnect an app at any time from{" "}
          <Link href="/kit" className={linkClass}>
            your kit page
          </Link>
          . A connection also ends when you reset your password, or after 12
          months without use.
        </li>
      </ul>

      {chatOn && (
        <>
          <h2 className={headingClass}>Asking the database</h2>
          <p className={paragraphClass}>
            A question typed into{" "}
            <Link href="/chat" className={linkClass}>
              Ask the database
            </Link>{" "}
            is sent to an AI model run by Google, through Vercel, to write the
            answer. We do not keep the conversation. Leave personal details out of
            your questions.
          </p>
        </>
      )}

      <h2 className={headingClass}>Links to eBay</h2>
      <p className={paragraphClass}>
        Listings and price links lead to eBay, and The Lens DB earns a
        commission on qualifying purchases as an eBay Partner Network
        affiliate. We send eBay nothing about you. When you follow a link, eBay
        learns that you came from this site and sets a cookie of its own, on
        its own site, so that a purchase made soon after can be credited to The
        Lens DB. From there, eBay&apos;s privacy policy applies.
      </p>

      <h2 className={headingClass}>Who else handles the data</h2>
      <p className={paragraphClass}>
        The accounts, kits and contributions live in a database that The Lens
        DB operates itself. A few companies handle data on our behalf, each for
        one job:
      </p>
      <ul className={listClass}>
        <li>
          <strong>Vercel</strong> hosts the site, runs the firewall, the bot
          check and most request limits, and counts the statistics above.
        </li>
        <li>
          <strong>Resend</strong> delivers our emails, so it handles your email
          address and the message.
        </li>
        <li>
          <strong>Upstash</strong> holds the short-lived counters behind the
          other limits (signing in, account actions, asking for a confirmation
          or reset link), keyed by IP address, by account number, or by the
          email address the link was requested for.
        </li>
        {chatOn && (
          <li>
            <strong>Google</strong> answers the questions put to Ask the database.
          </li>
        )}
      </ul>
      <p className={paragraphClass}>
        These companies are based in the United States, so data they handle may
        be processed outside the country you live in.
      </p>

      <h2 className={headingClass}>How long it is kept</h2>
      <ul className={listClass}>
        <li>Your account and your kit: until you ask for them to be deleted.</li>
        <li>The sign-in cookie: 30 days, or until you sign out.</li>
        <li>A link to confirm an address: 24 hours. A link to reset a password: 1 hour.</li>
        <li>A connection to another app: until it is ended, or 12 months without use.</li>
        <li>Rate counters: from a minute to an hour.</li>
        <li>
          Edits to the catalogue: kept as part of its history. If your account
          is deleted, they stay without your name.
        </li>
      </ul>

      <h2 className={headingClass}>Your choices</h2>
      <p className={paragraphClass}>
        You can ask for a copy of what is stored about you, have it corrected,
        or have your account and everything attached to it deleted. Write to{" "}
        <Contact /> from the address of your account and it will be done by
        hand, usually within a few days.
      </p>
      <p className={paragraphClass}>
        We use your data to provide the account you asked for and, for security
        and statistics, because the site cannot be kept working without them.
        If you live in the European Union or the United Kingdom, you also have
        the right to complain to your data protection authority.
      </p>

      <h2 className={headingClass}>Changes to this page</h2>
      <p className={paragraphClass}>
        When what the site stores changes, this page changes with it and the
        date at the top moves.
      </p>
    </div>
  );
}
