# Community Submissions Design

## Goal

Allow users to submit missing lenses and cameras to the database. Entries are immediately visible with an "unverified" badge until an admin reviews and verifies them.

## Decisions

- **Anonymous**: no user accounts, IP-tracked only (same as ratings/reports)
- **Full form**: users fill out the same fields as admin creation
- **Visible but flagged**: submissions appear publicly with "unverified" badge
- **New entries only**: existing issue reports system handles corrections
- **Rate limited**: 5 submissions per day per IP
- **Admin workflow**: verify (flip flag + edit) or reject (delete) via existing admin UI

## Schema Changes

Add two columns to both `lenses` and `cameras` tables:

- `verified` — boolean, default `true` (existing entries are verified)
- `submittedByIp` — text, nullable (null for admin-created, hashed IP for submissions)

Migration sets `verified = true` for all existing rows.

## Public API

### `POST /api/submissions`

Single endpoint for both lens and camera submissions.

- Request body: `entityType` ("lens" or "camera") + all creation fields
- Rate limited: 5 per day per IP
- Validates required fields (name, brand/system at minimum)
- Auto-generates slug from name
- Creates record with `verified = false`, `submittedByIp = hashedIp`
- Returns the created entry

No authentication required.

## Public UI

### Submission Page (`/submit`)

- Toggle to switch between "Lens" and "Camera" form
- Full form mirroring admin creation fields
- Messaging: "Community submission — will appear with an 'unverified' badge until reviewed by an admin"
- Success state: link to the newly created entry

### Entry Points

- Button/link in header nav or on listing pages
- "Can't find what you're looking for? Add it!"

### Unverified Badge

- **Listing pages** (`/lenses`, `/cameras`): small "Unverified" badge next to entry name
- **Detail pages** (`/lenses/[slug]`, `/cameras/[slug]`): banner at top — "This entry was submitted by the community and hasn't been verified yet"

## Admin UI

No new admin pages. Extend existing UI:

- **Admin listings** (`/admin/lenses`, `/admin/cameras`): add verified status filter (all / verified / unverified)
- **Admin edit pages**: add "Verified" toggle. Admin edits entry as needed, flips to verified, saves.
- **Reject**: admin deletes the entry using existing delete button
