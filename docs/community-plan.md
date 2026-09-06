# Community plan, September 2026

Written on 2026-09-06 after the traffic and membership review. The numbers
that prompted it: about 150 visitors a day, 37 accounts since March, of which
34 are real verified members, 4 have ever made an edit (7 edits between
them), and 1 kit exists (the owner's). Anonymous lens ratings run at about
100 a month from about 90 distinct addresses, so a few people a day already
do something on the site; they just never become members.

## What shipped with this plan

1. Funnel instrumentation: `signup_prompt_click`, `register_started`,
   `registered`, `email_verified`, `signed_in`, `kit_add`, `kit_remove`,
   `kit_published`, `rating_submit`, `rating_kit_nudge_click`,
   `edit_submitted`, `digest_opt_in`, plus the reset and resend events.
   All in Vercel Analytics under Custom Events.
2. Kit as the sign-up hook: the "I own this" button now shows to visitors and
   sends them to sign in; rating a lens offers to add it to your kit; an empty
   owners list invites you to be the first.
3. Funnel repairs: resend verification, password reset, welcome email, and an
   email when an edit is approved or rejected.
4. Visible credit: "Last edited by" on every lens and camera page, edit
   counts and recent edits on profiles, a public `/changes` page, and a
   "Most active editors" list on `/community`.
5. Outreach: `frontend/scripts/email-members.mjs`, dry run by default.
6. Return mechanism: `/new`, `/feed.xml`, and a weekly digest for members who
   opt in on their kit page.

## Where the Reddit evidence is

Every link below is a citation of the OLD site, lens-db.com, not of
thelensdb.com. On 2026-09-06 the Pullpush archive returned zero comments
and zero posts mentioning thelensdb.com, and its newest lens-db.com hit is
from early 2025, so it lags by months; the real referrer list is Vercel
Analytics, and Search Console once it exists.

The market research (`docs/redesign/research/report-market.md`, section 2)
was built from that archive's comments citing lens-db.com in its last year. The three jobs people used it for were version disambiguation,
per-system lens lists, and spec verification. Direct links in that report:

- r/VintageLenses, "Canon FD 100-300 5.6 which version":
  https://reddit.com/r/VintageLenses/comments/1k1ndkm/canon_fd_100300_56_which_version/mnt8igg/
- r/Nikon, "Which 35-105":
  https://reddit.com/r/Nikon/comments/1jmcjar/which_35105/mkbdceu/
- r/AnalogCommunity, "Lens recommendation Nikon FG-20":
  https://reddit.com/r/AnalogCommunity/comments/1j6rno7/lens_recommendation_nikon_fg_20/mgr0v7g/
- r/AnalogCommunity, "Minolta XD7 and Yashica FX-D":
  https://reddit.com/r/AnalogCommunity/comments/1j6gee9/any_thoughts_on_minolta_xd7_and_yashica_fxd/mgohvxa/
- r/analog, "How do you know the future camera you want to buy":
  https://reddit.com/r/analog/comments/1k8je1t/how_do_you_know_the_future_camera_you_want_to_buy/mp84v9u/

The full list of about 30 citations, Apr to Sep 2025:
https://api.pullpush.io/reddit/search/comment/?q=%22lens-db.com%22

The subreddits that carried them, in order of frequency in the evidence:
r/AnalogCommunity, r/VintageLenses, r/Nikon, r/photography,
r/AskPhotography, r/Leica, r/canon, r/minolta, r/pentax, r/FujiGFX,
r/photomarket, r/infraredphotography. The questions that recur weekly there
and that the site can now answer at a URL:

| Question as asked | Page that answers it |
|---|---|
| "Which version of the X is this" | the lens page, version badge, "Also sold as" |
| "What lenses fit my Y" | `/cameras/<slug>/lenses` |
| "Can I adapt A lenses to B" | `/adapters/<a>-to-<b>` |
| "X vs Y" | `/compare/lenses/<x>-vs-<y>` |
| "Which mount should I commit to" | `/systems/<slug>` |
| "What is this worth used" | the price guide on the lens page |

How to do it without being the person who gets banned: answer the question
in the comment first, in your own words, then give the link as the source.
One or two a day. Never post a link to the home page. Reply in threads that
are under a day old. Do not mention that you run the site unless asked, and
say so plainly when you are.

## Sitemap check

`frontend/src/app/sitemap.ts` lists both page classes:

- `/adapters/<from>-to-<to>` for every ordered pair in the adapter matrix.
- `/cameras/<slug>/lenses` for every camera with a recorded mount.
- `/compare/lenses/<a>-vs-<b>` for the comparable pairs.
- `/new` was added with this work.

What is not checked here and needs Google Search Console: whether those
pages have impressions. Add the property if it is not there yet, and read
the Pages report before doing any more SEO work.

## Features people would sign up for, ranked

Ranked by how directly each one turns a visit into an account, then by
build cost. The ones near the top are small.

1. **Serial-number dating.** "How old is my lens" is one of the ten jobs in
   the research and is answered today by a dozen 2000s hobby pages. Per-brand
   serial range tables (Canon date codes, Nikkor ranges from Roland Vink,
   Minolta, Pentax, Zeiss) on the lens page, and a field in the kit for
   the serial. Members who enter serials build the table for everyone; that
   is the PentaxForums loop. Sign-up reason: "date mine".
2. **Price paid, aggregated.** The kit already records what people paid.
   Once a lens has three or more paid figures, show "Members paid 90 to 140,
   median 110, 2023 to 2026" on the page, licence-clean and dated. Sign-up
   reason: "add mine to the average".
3. **Wishlist and price watch.** "I want this" next to "I own this". A
   wishlist is public social proof ("12 people here want one") and the hook
   for a price alert when a KEH or MPB listing appears under a threshold.
   Sign-up reason: obvious.
4. **Sample photos per lens.** The single thing lens-db.com had that this
   site lacks, and the thing the Crafting Pixels post missed most. Members
   upload a photo taken with the lens, CC BY-SA, credited, shown on the lens
   page. R2 upload exists already for admin. Sign-up reason: show your work.
5. **Short owner reviews.** Not a forum. One structured review per member
   per lens: recommended yes or no, price paid, new or used, body used, three
   lines of text. That is the PentaxForums form, and it is what made the
   SMC Pentax-M 50/1.7 page get a million views.
6. **"Fits my kit" everywhere.** Once someone has bodies in their kit, every
   lens page can say "Fits your Nikon FE natively" or "Adapts to your X-T5
   without infinity focus" using the adapter matrix. The kit becomes a tool,
   not a list.
7. **Contributor standing.** Wikipedia-style: patrolled edits, "verified
   against manufacturer" badges, a trusted tier earned by ten approved edits
   (the code already has tiers; make them visible). Cheap, and it gives the
   four people who have edited a reason to make an eleventh.
8. **Public kit page as a shareable card.** An OpenGraph image for
   `/community/<handle>` listing the kit, so a forum signature or a Reddit
   flair can link to it. The PCPartPicker distribution move.
9. **Lens identification help.** A "What lens is this?" form: mount, filter
   thread, focal length, markings, a photo, and the search narrows the
   catalogue. Anonymous to use, and a sign-up prompt to save the result to
   your kit.
10. **Watch a lens or mount.** Get an email when a page you care about is
    edited or a new lens appears on a mount you own. Uses the digest
    pipeline that now exists.

Do not build: a forum, comments under pages, direct messages, follower
counts. The precedents that survived grew community around ownership records
and structured reviews attached to the catalogue, not around talk.

## Open items

- Google Search Console: needs the owner's Google account.
- Sending the outreach email: `node --env-file=.env.local
  scripts/email-members.mjs --send` from `frontend/`, with `OUTREACH_REPLY_TO`
  set to a real inbox. Try `--only=<handle>` on one person first.
- The "Recently added" block on the home page and `/new` will both show
  the DPReview Watcher's imports; that is correct, but the bulk camera-wiki
  imports make single days with hundreds of rows. The page caps at 200.
