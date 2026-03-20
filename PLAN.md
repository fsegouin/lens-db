# Wiki-Style Collaborative Editing — Implementation Plan

## Prerequisites

### Neon Branch Setup
1. Create a Neon branch from production via the Neon console or CLI:
   ```bash
   neonctl branches create --name dev/wiki-editing --project-id <project-id>
   ```
2. Copy the branch's connection string and set it as `DATABASE_URL` in `.env.local`
3. All schema migrations run against this branch — production is untouched until merge

### Resend Setup
1. Create account at resend.com, verify sending domain
2. Add `RESEND_API_KEY` to `.env.local` and `.env.example`
3. Install: `pnpm add resend`

---

## Phase 1: User Accounts & Auth

### 1.1 — Schema: `users` table
Add to `src/db/schema.ts`:

```ts
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull().unique(),
  role: text("role").notNull().default("user"), // "user" | "trusted" | "admin"
  editCount: integer("edit_count").default(0),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  isBanned: boolean("is_banned").default(false),
  banReason: text("ban_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_users_email").on(table.email),
  index("idx_users_role").on(table.role),
]);
```

### 1.2 — Schema: `email_verification_tokens` table

```ts
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

### 1.3 — Auth library: `src/lib/user-auth.ts`
- Password hashing with `crypto.subtle` (Web Crypto API, no extra deps — use PBKDF2 or scrypt via Node crypto)
- Session management: JWT or signed cookie (similar pattern to existing admin-auth.ts but for user sessions)
- Session stored in HTTP-only cookie `user_session`
- Functions: `registerUser()`, `loginUser()`, `getCurrentUser()`, `requireUser()`, `requireVerifiedUser()`

### 1.4 — Email service: `src/lib/email.ts`
- Initialize Resend client with `RESEND_API_KEY`
- `sendVerificationEmail(email, token)` — sends link to `/verify-email?token=xxx`
- `sendPasswordResetEmail(email, token)` — future use
- React Email templates in `src/emails/` (verification, password reset)

### 1.5 — API routes
- `POST /api/auth/register` — create user, send verification email
- `POST /api/auth/login` — validate credentials, set session cookie
- `POST /api/auth/logout` — clear session cookie
- `GET /api/auth/verify-email?token=xxx` — verify email, redirect to login
- `GET /api/auth/me` — return current user (for client components)

### 1.6 — Pages
- `/register` — registration form (email, password, display name)
- `/login` — login form
- `/verify-email` — token verification landing page

### 1.7 — User context
- `src/components/user-context.tsx` — React context providing current user to client components
- Header nav shows login/register or user display name + logout
- Wire into existing `header-nav.tsx` and `mobile-nav.tsx`

---

## Phase 2: Revision History System

### 2.1 — Schema: `revisions` table

```ts
export const revisions = pgTable("revisions", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(), // "lens" | "camera" | "system" | "collection" | "series"
  entityId: integer("entity_id").notNull(),
  revisionNumber: integer("revision_number").notNull(),
  data: jsonb("data").notNull(), // full snapshot of entity at this revision
  summary: text("summary").notNull(), // edit summary (required)
  changedFields: jsonb("changed_fields").default([]), // string[] of field names that changed
  userId: integer("user_id").references(() => users.id),
  ipHash: text("ip_hash"),
  isRevert: boolean("is_revert").default(false),
  revertedToRevision: integer("reverted_to_revision"), // which revision was restored
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_revisions_entity").on(table.entityType, table.entityId),
  index("idx_revisions_user").on(table.userId),
  index("idx_revisions_created").on(table.createdAt),
  unique("uq_revision_number").on(table.entityType, table.entityId, table.revisionNumber),
]);
```

### 2.2 — Schema: add `protectionLevel` to entity tables
Add column to `lenses`, `cameras`, `systems`, `collections`, `lensSeries`:
```ts
protectionLevel: text("protection_level").default("none"), // "none" | "autoconfirmed" | "trusted" | "admin"
```

### 2.3 — Revision service: `src/lib/revisions.ts`
Core functions:
- `createRevision(entityType, entityId, data, summary, userId)` — snapshot current state, compute changed fields, increment revision number
- `getRevisionHistory(entityType, entityId, page)` — paginated list of revisions
- `getRevision(revisionId)` — single revision with full data
- `revertToRevision(revisionId, adminUserId)` — create new revision with old data, mark as revert
- `diffRevisions(revisionA, revisionB)` — compute field-level diff between two snapshots

### 2.4 — Edit validation: `src/lib/edit-validation.ts`
Before saving any edit:
- **Schema validation**: type-check all fields (numeric fields are numbers, years are 4 digits, etc.)
- **Blanking detection**: reject if >50% of non-null fields are being cleared
- **Protection check**: verify user's role meets the page's `protectionLevel`
- **Ban check**: reject if user is banned
- **Email verification check**: reject if email not verified
- **Rate limit**: max 30 edits per hour per user (via Upstash)

### 2.5 — Wrap existing admin update APIs
Modify existing `PUT /api/admin/{entity}/[id]` routes to also create a revision when updating. This ensures admin edits are tracked too. The admin user ID can be a special system user (id=1).

---

## Phase 3: Public Edit API & UI

### 3.1 — API routes for public editing
- `PUT /api/entities/[entityType]/[id]/edit` — authenticated, validated, creates revision
- `GET /api/entities/[entityType]/[id]/history` — public, paginated revision list
- `GET /api/entities/[entityType]/[id]/diff?from=X&to=Y` — public, diff between revisions

### 3.2 — Edit UI on entity pages
Add an "Edit" button/tab to each entity detail page (`/lenses/[slug]`, `/cameras/[...slug]`, etc.):
- Clicking "Edit" shows an inline form (reuse field structure from admin forms but lighter)
- Required: edit summary field ("Describe your change")
- Submit → `PUT /api/entities/.../edit` → page revalidates
- Only shown to logged-in, verified users
- Respect `protectionLevel` — show "this page is protected" message if user lacks permission

### 3.3 — Revision history page
`/lenses/[slug]/history`, `/cameras/[slug]/history`, etc.:
- Table of all revisions: revision #, date, user, summary, changed fields count
- Click any revision to see full snapshot
- "Compare" checkbox to select two revisions for diff view
- Admin sees "Restore this version" button on each revision

### 3.4 — Diff view component
`src/components/RevisionDiff.tsx`:
- Side-by-side or inline field comparison
- Highlight added/removed/changed values
- For text fields: word-level diff
- For numeric fields: old → new with color coding
- For JSON fields (specs): key-level diff

---

## Phase 4: Anti-Vandalism & Moderation

### 4.1 — Schema: `patrol_status` on revisions
Add to revisions table:
```ts
isPatrolled: boolean("is_patrolled").default(false),
patrolledByUserId: integer("patrolled_by_user_id").references(() => users.id),
patrolledAt: timestamp("patrolled_at", { withTimezone: true }),
```

### 4.2 — Trust tier logic: `src/lib/trust.ts`
Determine user tier based on:
- **New user**: `emailVerifiedAt` is set, `editCount < 10` OR account < 3 days old
- **Autoconfirmed**: `editCount >= 10` AND account >= 3 days old
- **Trusted**: `role === "trusted"` (manually granted by admin)
- **Admin**: `role === "admin"`

New user edits: `isPatrolled = false` (shows in patrol queue).
Autoconfirmed+ edits: `isPatrolled = true` (auto-patrolled).

### 4.3 — Recent changes feed: `/admin/recent-changes`
Admin page showing:
- All revisions, newest first, with filters (entity type, user, date range, unpatrolled only)
- Each row: entity name + link, user, timestamp, summary, changed fields count
- Color coding: unpatrolled (orange highlight), reverts (red)
- Quick actions: "Patrol" (mark as reviewed), "Revert" (one-click rollback), "View diff"
- Link to user profile to review their full edit history

### 4.4 — Patrol API
- `POST /api/admin/revisions/[id]/patrol` — mark as patrolled
- `POST /api/admin/revisions/[id]/revert` — revert to previous version
- `GET /api/admin/recent-changes` — paginated feed with filters

### 4.5 — User management
- `GET /api/admin/users` — list users with edit counts, roles, ban status
- `PUT /api/admin/users/[id]` — update role, ban/unban
- `/admin/users` — admin page for user management
- `/admin/users/[id]` — user detail with full edit history

### 4.6 — Extend `blockedIps` table
Add expiration support:
```ts
expiresAt: timestamp("expires_at", { withTimezone: true }), // null = permanent
```

---

## Phase 5: Duplicate Flagging

### 5.1 — Schema: `duplicate_flags` table

```ts
export const duplicateFlags = pgTable("duplicate_flags", {
  id: serial("id").primaryKey(),
  sourceEntityType: text("source_entity_type").notNull(),
  sourceEntityId: integer("source_entity_id").notNull(),
  targetEntityType: text("target_entity_type").notNull(),
  targetEntityId: integer("target_entity_id").notNull(),
  reason: text("reason"),
  flaggedByUserId: integer("flagged_by_user_id").references(() => users.id),
  status: text("status").notNull().default("pending"), // "pending" | "confirmed" | "dismissed"
  resolvedByUserId: integer("resolved_by_user_id").references(() => users.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_duplicate_flags_status").on(table.status),
]);
```

### 5.2 — Schema: add `mergedIntoId` to entity tables
Add to `lenses`, `cameras`:
```ts
mergedIntoId: integer("merged_into_id"), // self-referencing, null = not merged
```
When set, the entity detail page redirects to the merged target.

### 5.3 — API routes
- `POST /api/duplicates` — flag a duplicate (authenticated)
- `GET /api/admin/duplicates` — list pending flags
- `PUT /api/admin/duplicates/[id]` — resolve: confirm (merge/delete) or dismiss

### 5.4 — UI
- "Flag as duplicate" button on entity detail pages (search for target entity)
- `/admin/duplicates` — queue with side-by-side comparison of flagged pair
- Merge action: keep one entity, set `mergedIntoId` on the other, transfer ratings/views

---

## Phase 6: Watchlist & Notifications (Future)

### 6.1 — Schema: `watchlist` table
```ts
export const watchlist = pgTable("watchlist", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.entityType, table.entityId] }),
]);
```

### 6.2 — Notification on edit
When a revision is created, check watchlist and optionally send email via Resend to watchers.

---

## Implementation Order

| Step | What | Files touched | Depends on |
|------|------|---------------|------------|
| 0 | Neon branch + Resend setup | `.env.local`, `package.json` | — |
| 1 | Users table + auth library | `schema.ts`, new `user-auth.ts`, new `email.ts` | Step 0 |
| 2 | Auth API routes | New routes in `api/auth/` | Step 1 |
| 3 | Auth pages (register, login) | New pages, update header nav | Step 2 |
| 4 | Revisions table + service | `schema.ts`, new `revisions.ts` | Step 1 |
| 5 | Wire admin edits to create revisions | Modify `api/admin/*/[id]/route.ts` | Step 4 |
| 6 | Revision history page + diff view | New pages + components | Step 4 |
| 7 | Public edit API + UI | New routes, edit forms on detail pages | Steps 3, 4 |
| 8 | Trust tiers + patrol | New `trust.ts`, patrol API, admin page | Steps 4, 7 |
| 9 | Recent changes feed | New admin page | Step 8 |
| 10 | User management admin page | New admin page | Step 3 |
| 11 | Edit validation/filters | New `edit-validation.ts` | Step 7 |
| 12 | Duplicate flagging | New table, API, admin page | Step 3 |
| 13 | Protection levels | Add column, enforce in edit API | Step 8 |
| 14 | Watchlist + notifications | New table, Resend integration | Steps 4, 1 |

## New Dependencies
- `resend` — email sending
- No other new dependencies needed (crypto is built-in, auth uses existing cookie pattern)

## New Environment Variables
- `RESEND_API_KEY` — Resend API key for sending emails
- `RESEND_FROM_EMAIL` — verified sender address (e.g., `noreply@yourdomain.com`)
- `APP_URL` — base URL for email verification links (e.g., `https://lens-db.com`)
