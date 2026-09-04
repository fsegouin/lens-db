import {
  pgTable,
  serial,
  text,
  real,
  integer,
  boolean,
  jsonb,
  timestamp,
  date,
  primaryKey,
  index,
  uniqueIndex,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const systems = pgTable("systems", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  mountType: text("mount_type"),
  // Flange focal distance in mm: the film/sensor-to-mount register. This is
  // what decides whether one mount's lenses can reach infinity focus on
  // another's body, so it is the basis of every adapting answer.
  flangeDistanceMm: real("flange_distance_mm"),
  /**
   * The Wikidata item for this mount, so other tools can resolve our record
   * to theirs. Only set where the item is demonstrably the mount: Wikidata
   * files most mounts as a "technical standard" rather than a lens mount, and
   * a name search alone returns the camera or the manufacturer just as often.
   */
  wikidataQid: text("wikidata_qid"),
  manufacturer: text("manufacturer"),
  viewCount: integer("view_count").default(0),
  protectionLevel: text("protection_level").default("none"), // "none" | "autoconfirmed" | "trusted" | "admin"
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const lenses = pgTable(
  "lenses",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    url: text("url"),
    brand: text("brand"),
    systemId: integer("system_id").references(() => systems.id),
    description: text("description"),
    lensType: text("lens_type"),
    era: text("era"),
    productionStatus: text("production_status"),
    // Common specs for filtering
    focalLengthMin: real("focal_length_min"),
    focalLengthMax: real("focal_length_max"),
    apertureMin: real("aperture_min"),
    apertureMax: real("aperture_max"),
    weightG: real("weight_g"),
    filterSizeMm: real("filter_size_mm"),
    minFocusDistanceM: real("min_focus_distance_m"),
    maxMagnification: real("max_magnification"),
    lensElements: integer("lens_elements"),
    lensGroups: integer("lens_groups"),
    diaphragmBlades: integer("diaphragm_blades"),
    yearIntroduced: integer("year_introduced"),
    yearDiscontinued: integer("year_discontinued"),
    isZoom: boolean("is_zoom").default(false),
    isMacro: boolean("is_macro").default(false),
    isPrime: boolean("is_prime").default(false),
    hasStabilization: boolean("has_stabilization").default(false),
    hasAutofocus: boolean("has_autofocus").default(false),
    coverage: text("coverage"), // "full-frame" | "aps-c" | "micro-four-thirds" | null (unknown)
    // Engagement
    viewCount: integer("view_count").default(0),
    averageRating: real("average_rating"),
    ratingCount: integer("rating_count").default(0),
    // Full specs and images as JSON
    specs: jsonb("specs").default({}),
    images: jsonb("images").default([]),
    verified: boolean("verified").default(true).notNull(),
    submittedByIp: text("submitted_by_ip"),
    protectionLevel: text("protection_level").default("none"), // "none" | "autoconfirmed" | "trusted" | "admin"
    mergedIntoId: integer("merged_into_id"), // self-referencing: if set, this entity was merged into another
    // Version lineage: lenses sharing a versionGroupId are generations of the
    // same optical product (e.g. Summicron-M 50mm f/2 Type IV / Type V)
    versionGroupId: integer("version_group_id").references(() => lensVersionGroups.id),
    versionLabel: text("version_label"), // e.g. "Type IV", "II", "Mark 2"
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_lenses_system").on(table.systemId),
    index("idx_lenses_version_group").on(table.versionGroupId),
    index("idx_lenses_brand").on(table.brand),
    index("idx_lenses_focal").on(table.focalLengthMin, table.focalLengthMax),
    index("idx_lenses_aperture").on(table.apertureMin),
    index("idx_lenses_year").on(table.yearIntroduced),
  ]
);

export const cameras = pgTable(
  "cameras",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    url: text("url"),
    systemId: integer("system_id").references(() => systems.id),
    // The non-removable lens of a fixed-lens body (Konica C35, Fuji GW670,
    // Hasselblad SWC, GFX 100RF). Every lens/camera relation on this site is
    // derived from a shared system_id, so before this column a fixed-lens
    // camera could only be recorded by lying: leaving system_id null (47
    // bodies, whose pages then showed no mount and no lens), inventing a
    // one-camera "system" to host it, or borrowing the mount of an
    // interchangeable sibling that the body does not actually accept. The
    // lens it points at is a real lenses row with a null system_id, so it
    // gets a page, specs and price history like any other.
    builtInLensId: integer("built_in_lens_id").references(() => lenses.id),
    description: text("description"),
    alias: text("alias"),
    sensorType: text("sensor_type"),
    sensorSize: text("sensor_size"),
    megapixels: real("megapixels"),
    resolution: text("resolution"),
    yearIntroduced: integer("year_introduced"),
    bodyType: text("body_type"),
    // The shutter mechanism ("Focal-plane", "In-lens leaf shutter"). 476
    // cameras had it recorded in body_type, where the page showed it as though
    // it were the body style.
    shutterType: text("shutter_type"),
    weightG: real("weight_g"),
    viewCount: integer("view_count").default(0),
    averageRating: real("average_rating"),
    ratingCount: integer("rating_count").default(0),
    specs: jsonb("specs").default({}),
    images: jsonb("images").default([]),
    verified: boolean("verified").default(true).notNull(),
    submittedByIp: text("submitted_by_ip"),
    protectionLevel: text("protection_level").default("none"), // "none" | "autoconfirmed" | "trusted" | "admin"
    mergedIntoId: integer("merged_into_id"), // self-referencing: if set, this entity was merged into another
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_cameras_system").on(table.systemId),
    index("idx_cameras_built_in_lens").on(table.builtInLensId),
  ]
);

export const collections = pgTable("collections", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  protectionLevel: text("protection_level").default("none"), // "none" | "autoconfirmed" | "trusted" | "admin"
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const lensCollections = pgTable(
  "lens_collections",
  {
    lensId: integer("lens_id")
      .notNull()
      .references(() => lenses.id, { onDelete: "cascade" }),
    collectionId: integer("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.lensId, table.collectionId] })]
);

export const lensSeries = pgTable("lens_series", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  protectionLevel: text("protection_level").default("none"), // "none" | "autoconfirmed" | "trusted" | "admin"
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const lensSeriesMemberships = pgTable(
  "lens_series_memberships",
  {
    lensId: integer("lens_id")
      .notNull()
      .references(() => lenses.id, { onDelete: "cascade" }),
    seriesId: integer("series_id")
      .notNull()
      .references(() => lensSeries.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.lensId, table.seriesId] })]
);

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const lensTags = pgTable(
  "lens_tags",
  {
    lensId: integer("lens_id")
      .notNull()
      .references(() => lenses.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.lensId, table.tagId] }),
    index("idx_lens_tags_tag").on(table.tagId),
    index("idx_lens_tags_lens").on(table.lensId),
  ]
);

export const lensCompatibility = pgTable(
  "lens_compatibility",
  {
    lensId: integer("lens_id")
      .notNull()
      .references(() => lenses.id, { onDelete: "cascade" }),
    cameraId: integer("camera_id")
      .notNull()
      .references(() => cameras.id, { onDelete: "cascade" }),
    isNative: boolean("is_native").default(true),
    notes: text("notes"),
  },
  (table) => [primaryKey({ columns: [table.lensId, table.cameraId] })]
);

export const lensRatings = pgTable(
  "lens_ratings",
  {
    id: serial("id").primaryKey(),
    lensId: integer("lens_id")
      .notNull()
      .references(() => lenses.id, { onDelete: "cascade" }),
    ipHash: text("ip_hash").notNull(),
    rating: integer("rating").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("uq_lens_ratings_lens_ip").on(table.lensId, table.ipHash),
    index("idx_lens_ratings_lens").on(table.lensId),
    check("chk_rating_range", sql`${table.rating} >= 1 AND ${table.rating} <= 10`),
  ]
);

export const cameraRatings = pgTable(
  "camera_ratings",
  {
    id: serial("id").primaryKey(),
    cameraId: integer("camera_id")
      .notNull()
      .references(() => cameras.id, { onDelete: "cascade" }),
    ipHash: text("ip_hash").notNull(),
    rating: integer("rating").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("uq_camera_ratings_camera_ip").on(table.cameraId, table.ipHash),
    index("idx_camera_ratings_camera").on(table.cameraId),
    check("chk_camera_rating_range", sql`${table.rating} >= 1 AND ${table.rating} <= 10`),
  ]
);

export const issueReports = pgTable(
  "issue_reports",
  {
    id: serial("id").primaryKey(),
    entityType: text("entity_type").notNull(), // "lens" | "camera" | "system" | "collection"
    entityId: integer("entity_id").notNull(),
    entityName: text("entity_name").notNull(),
    entitySlug: text("entity_slug"),
    message: text("message").notNull(),
    fieldName: text("field_name"),
    oldValue: text("old_value"),
    suggestedValue: text("suggested_value"),
    ipAddress: text("ip_address"),
    country: text("country"),
    status: text("status").notNull().default("pending"), // "pending" | "accepted" | "dismissed"
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_issue_reports_status").on(table.status),
  ]
);

export const blockedIps = pgTable("blocked_ips", {
  id: serial("id").primaryKey(),
  ipAddress: text("ip_address").notNull().unique(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull().unique(),
    // URL-safe form of displayName, for /kit/<handle>. Display names may hold
    // spaces and punctuation that do not belong in a path.
    handle: text("handle").unique(),
    /**
     * A kit is an inventory of what someone owns and what it is worth, which
     * is a theft-target list as much as a profile. It is private until the
     * owner publishes it.
     */
    kitIsPublic: boolean("kit_is_public").notNull().default(false),
    /**
     * The currency the owner records what they paid in. Nothing is converted:
     * the site's own estimates are in USD and stay labelled that way, since
     * converting would need an exchange rate this database does not have.
     */
    kitCurrency: text("kit_currency").notNull().default("USD"),
    role: text("role").notNull().default("user"), // "user" | "trusted" | "admin"
    editCount: integer("edit_count").default(0),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    isBanned: boolean("is_banned").default(false),
    banReason: text("ban_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_users_email").on(table.email),
    index("idx_users_role").on(table.role),
  ]
);

/**
 * What a signed-in person owns: their kit.
 *
 * entityId is polymorphic over lenses and cameras, following priceHistory and
 * priceEstimates, so there is no foreign key to enforce it.
 *
 * acquiredPrice is the one price on this site that nobody licensed from
 * anywhere: it is what the owner says they paid. The eBay pipeline cannot be
 * redistributed and has recorded nothing since July; this can be both.
 */
export const kitItems = pgTable(
  "kit_items",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(), // "lens" | "camera"
    entityId: integer("entity_id").notNull(),
    quantity: integer("quantity").notNull().default(1),
    condition: text("condition"), // "Excellent" | "Good" | "Fair" | "For parts"
    serialNumber: text("serial_number"),
    // The year is all anyone remembers, and a full date would be invented.
    acquiredYear: integer("acquired_year"),
    // In the owner's kitCurrency, not necessarily USD.
    acquiredPrice: integer("acquired_price"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    // One row per thing owned; owning two of the same lens is a quantity.
    unique("uq_kit_items_user_entity").on(
      table.userId,
      table.entityType,
      table.entityId,
    ),
    index("idx_kit_items_user").on(table.userId),
    index("idx_kit_items_entity").on(table.entityType, table.entityId),
    check("chk_kit_quantity", sql`${table.quantity} >= 1 AND ${table.quantity} <= 999`),
    check(
      "chk_kit_entity_type",
      sql`${table.entityType} IN ('lens', 'camera')`,
    ),
  ]
);

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/**
 * Where one field's value came from, when that is not the bulk import.
 *
 * Almost every fact here arrived in one scrape: 8,543 of 9,320 lenses carry a
 * lens-db.com url and 880 field-level edits have ever been made against some
 * 62,000 populated lens fields. Storing a citation per field would therefore
 * be 60,000 rows repeating the same sentence, so the entity's own url stays
 * the default and this table holds only the exceptions: a field somebody
 * re-sourced, verified against the manufacturer, imported from DPReview, or
 * corrected by hand.
 *
 * That makes the re-sourcing backlog a query rather than a spreadsheet: a
 * field with no row here has never been checked against anything but the
 * original scrape.
 */
export const fieldCitations = pgTable(
  "field_citations",
  {
    id: serial("id").primaryKey(),
    entityType: text("entity_type").notNull(), // "lens" | "camera" | "system"
    entityId: integer("entity_id").notNull(),
    /** Schema field name, e.g. "weightG". "specs.Mount" addresses one spec key. */
    field: text("field").notNull(),
    /** Human-readable publisher: "Nikon", "DPReview", "Wikidata", "camera-wiki". */
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url"),
    /** When the source was consulted, which is what makes a citation checkable. */
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull().defaultNow(),
    /** The revision that introduced it, when a person made the change here. */
    revisionId: integer("revision_id"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_field_citations_entity").on(table.entityType, table.entityId),
    // One live citation per field: re-sourcing a field replaces its citation
    // rather than stacking a second one beside it.
    uniqueIndex("uq_field_citations_entity_field").on(
      table.entityType,
      table.entityId,
      table.field,
    ),
  ]
);

export const revisions = pgTable(
  "revisions",
  {
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
    revertedToRevision: integer("reverted_to_revision"),
    isPatrolled: boolean("is_patrolled").default(false),
    patrolledByUserId: integer("patrolled_by_user_id").references(() => users.id),
    patrolledAt: timestamp("patrolled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_revisions_entity").on(table.entityType, table.entityId),
    index("idx_revisions_user").on(table.userId),
    index("idx_revisions_created").on(table.createdAt),
    unique("uq_revision_number").on(table.entityType, table.entityId, table.revisionNumber),
  ]
);

export const pendingEdits = pgTable(
  "pending_edits",
  {
    id: serial("id").primaryKey(),
    entityType: text("entity_type").notNull(), // "lens" | "camera" | "system" | "collection" | "series"
    entityId: integer("entity_id").notNull(),
    changes: jsonb("changes").notNull(), // Record<string, unknown> — only the changed fields
    summary: text("summary").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ipHash: text("ip_hash"),
    status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected"
    reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectReason: text("reject_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_pending_edits_status").on(table.status),
    index("idx_pending_edits_user").on(table.userId),
  ]
);

export const duplicateFlags = pgTable(
  "duplicate_flags",
  {
    id: serial("id").primaryKey(),
    sourceEntityType: text("source_entity_type").notNull(), // "lens" | "camera"
    sourceEntityId: integer("source_entity_id").notNull(),
    targetEntityType: text("target_entity_type").notNull(),
    targetEntityId: integer("target_entity_id").notNull(),
    reason: text("reason"),
    flaggedByUserId: integer("flagged_by_user_id").references(() => users.id),
    status: text("status").notNull().default("pending"), // "pending" | "confirmed" | "dismissed"
    resolvedByUserId: integer("resolved_by_user_id").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_duplicate_flags_status").on(table.status)]
);

export const lensComparisons = pgTable(
  "lens_comparisons",
  {
    id: serial("id").primaryKey(),
    lensId1: integer("lens_id_1")
      .notNull()
      .references(() => lenses.id, { onDelete: "cascade" }),
    lensId2: integer("lens_id_2")
      .notNull()
      .references(() => lenses.id, { onDelete: "cascade" }),
    viewCount: integer("view_count").default(1),
    lastComparedAt: timestamp("last_compared_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("uq_lens_comparisons_pair").on(table.lensId1, table.lensId2),
    index("idx_lens_comparisons_views").on(table.viewCount),
    check("chk_lens_order", sql`${table.lensId1} < ${table.lensId2}`),
  ]
);

export const cameraComparisons = pgTable(
  "camera_comparisons",
  {
    id: serial("id").primaryKey(),
    cameraId1: integer("camera_id_1")
      .notNull()
      .references(() => cameras.id, { onDelete: "cascade" }),
    cameraId2: integer("camera_id_2")
      .notNull()
      .references(() => cameras.id, { onDelete: "cascade" }),
    viewCount: integer("view_count").default(1),
    lastComparedAt: timestamp("last_compared_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("uq_camera_comparisons_pair").on(table.cameraId1, table.cameraId2),
    index("idx_camera_comparisons_views").on(table.viewCount),
    check("chk_camera_order", sql`${table.cameraId1} < ${table.cameraId2}`),
  ]
);

export const priceEstimates = pgTable(
  "price_estimates",
  {
    id: serial("id").primaryKey(),
    entityType: text("entity_type").notNull(), // "camera" | "lens"
    entityId: integer("entity_id").notNull(),
    sourceUrl: text("source_url"),
    sourceName: text("source_name"),
    priceAverageLow: integer("price_average_low"),
    priceAverageHigh: integer("price_average_high"),
    priceVeryGoodLow: integer("price_very_good_low"),
    priceVeryGoodHigh: integer("price_very_good_high"),
    priceMintLow: integer("price_mint_low"),
    priceMintHigh: integer("price_mint_high"),
    medianPrice: integer("median_price"), // median of all sale prices — best single "what you'd pay" number
    currency: text("currency").default("USD"),
    // What this estimate is actually built from, so the page can say the
    // true thing rather than one label for both. "sold" means real completed
    // sales; "asking" means live listings corrected by the calibration
    // factor, which is an inference and must not be presented as a sale.
    priceSource: text("price_source").default("sold").notNull(),
    // Dead since the eBay blackout: rarity was derived from 90-day sold
    // volume, which stopped being a fact about scarcity the moment ingest
    // paused. Nothing reads or writes these; kept only so the columns can be
    // repopulated if a reliable volume signal returns.
    rarity: text("rarity"),
    rarityVotes: integer("rarity_votes"),
    extractedAt: timestamp("extracted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_price_estimates_entity").on(table.entityType, table.entityId),
    index("idx_price_estimates_entity").on(table.entityType, table.entityId),
  ]
);

// A group of lenses that are successive versions of the same optical product
export const lensVersionGroups = pgTable("lens_version_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // base product name, e.g. "Leica Summicron-M 50mm f/2"
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Mount availability (M:N): every system a lens is sold for. lenses.systemId
// stays the primary/reference mount used by existing filters and pages.
export const lensSystems = pgTable(
  "lens_systems",
  {
    lensId: integer("lens_id")
      .notNull()
      .references(() => lenses.id, { onDelete: "cascade" }),
    systemId: integer("system_id")
      .notNull()
      .references(() => systems.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.lensId, table.systemId] }),
    index("idx_lens_systems_system").on(table.systemId),
  ]
);

// Old system slugs that now point at a surviving system. Written by
// scripts/consolidate-systems.mjs when duplicate/variant systems are merged
// and their rows deleted; /systems/[slug] redirects through this table.
export const systemRedirects = pgTable("system_redirects", {
  oldSlug: text("old_slug").primaryKey(),
  systemId: integer("system_id")
    .notNull()
    .references(() => systems.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Seen-registry for the DPReview new-lens watcher: one row per DPReview
// product ever processed, so candidates are never re-proposed (including
// after rejection) and already-matched lenses are never reprocessed.
export const dpreviewLensCandidates = pgTable(
  "dpreview_lens_candidates",
  {
    id: serial("id").primaryKey(),
    dpreviewSlug: text("dpreview_slug").notNull().unique(),
    dpreviewUrl: text("dpreview_url").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("pending"), // "pending" | "imported" | "rejected" | "matched" | "review"
    lensId: integer("lens_id").references(() => lenses.id),
    pendingEditId: integer("pending_edit_id").references(() => pendingEdits.id),
    // For status "review" (LLM not ≥90% sure the suspected duplicate is real):
    // the raw scraped candidate, kept so the review CLI can resolve it without
    // re-scraping, plus the LLM's verdict
    candidateData: jsonb("candidate_data"),
    llmVerdict: text("llm_verdict"), // "duplicate" | "new_version" | "new_lens"
    // Deprecated: superseded by llmVerdict; kept because migration 0019 already
    // ran. Nothing writes or reads it — drop in a future consolidation.
    llmIsDuplicate: boolean("llm_is_duplicate"),
    llmConfidence: real("llm_confidence"),
    llmReasoning: text("llm_reasoning"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_dpreview_lens_candidates_status").on(table.status)]
);

export const priceHistory = pgTable(
  "price_history",
  {
    id: serial("id").primaryKey(),
    entityType: text("entity_type").notNull(), // "camera" | "lens"
    entityId: integer("entity_id").notNull(),
    saleDate: date("sale_date"),
    condition: text("condition"), // A, B, C, B-A, B-C, etc.
    priceUsd: integer("price_usd"),
    source: text("source"), // eBay, LP Foto Auction, etc.
    sourceUrl: text("source_url"), // link to the original listing
    // The listing title the classifier judged. Kept because without it a
    // recorded sale cannot be re-checked: a sold listing disappears from eBay,
    // so sourceUrl stops resolving and the evidence for the price is gone.
    // This is what made the misattributed shift-lens sales impossible to audit.
    title: text("title"),
    extractedAt: timestamp("extracted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_price_history_entity").on(table.entityType, table.entityId),
    uniqueIndex("uq_price_history_entity_source_url")
      .on(table.entityType, table.entityId, table.sourceUrl)
      .where(sql`source_url IS NOT NULL`),
  ]
);

// One row per eBay listing we have seen active, per entity it was found for.
//
// eBay's API cannot search sold listings — that capability is gated behind
// Marketplace Insights, which our keys are refused. It will, however, resolve
// any item by id long after it ends and report its final price. So real sale
// prices are reachable only by noticing a listing while it is live and
// checking back once it is over. This table is that memory.
//
// `resolution` is null while the listing is still open or not yet checked.
export const ebayListingWatch = pgTable(
  "ebay_listing_watch",
  {
    id: serial("id").primaryKey(),
    entityType: text("entity_type").notNull(), // "camera" | "lens"
    entityId: integer("entity_id").notNull(),
    legacyItemId: text("legacy_item_id").notNull(),
    title: text("title"),
    condition: text("condition"),
    askingPriceUsd: integer("asking_price_usd"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    // Last search that still returned this listing. A watched listing that
    // stops coming back has ended, which is how the pipeline finds sales
    // without spending an API call per listing per cycle.
    lastSeenActiveAt: timestamp("last_seen_active_at", { withTimezone: true }),
    // Set by the ingest pass when a search no longer returns this listing.
    // Only rows with this set are worth spending a resolve call on.
    disappearedAt: timestamp("disappeared_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    // "sold" | "expired" | "gone" (item no longer resolvable), null = pending
    resolution: text("resolution"),
    soldPriceUsd: integer("sold_price_usd"),
    soldOn: date("sold_on"),
  },
  (table) => [
    unique("uq_ebay_watch_entity_item").on(
      table.entityType,
      table.entityId,
      table.legacyItemId,
    ),
    // The resolve queue: unresolved listings, oldest first.
    index("idx_ebay_watch_pending")
      .on(table.firstSeenAt)
      .where(sql`resolution IS NULL`),
    // Finding the listings a given entity's latest search stopped returning.
    index("idx_ebay_watch_last_seen")
      .on(table.entityType, table.entityId, table.lastSeenActiveAt)
      .where(sql`resolution IS NULL`),
    // The resolve queue proper: gone, and not yet accounted for.
    index("idx_ebay_watch_disappeared")
      .on(table.disappearedAt)
      .where(sql`resolution IS NULL AND disappeared_at IS NOT NULL`),
  ]
);

// Daily asking-price aggregate per entity, from the Browse API's active
// listings. Deliberately not written into price_history: an asking price is
// not a sale, and mixing the two would make the sale record unusable. Kept as
// its own series so the site can show what sellers want against what buyers
// actually pay, and so the chart carries exactly one point per day.
export const ebayAskingSnapshots = pgTable(
  "ebay_asking_snapshots",
  {
    id: serial("id").primaryKey(),
    entityType: text("entity_type").notNull(), // "camera" | "lens"
    entityId: integer("entity_id").notNull(),
    observedOn: date("observed_on").notNull(),
    medianUsd: integer("median_usd"),
    p25Usd: integer("p25_usd"),
    p75Usd: integer("p75_usd"),
    sampleCount: integer("sample_count").notNull(),
    // eBay's reported total matching listings, which is far larger than the
    // sample we page through. A usable liquidity signal in its own right.
    totalAvailable: integer("total_available"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_ebay_asking_entity_day").on(
      table.entityType,
      table.entityId,
      table.observedOn,
    ),
    index("idx_ebay_asking_entity").on(table.entityType, table.entityId),
    // Serves retention. The unique index above cannot: observed_on is its
    // last column, so a plain date-range delete would scan the whole table.
    index("idx_ebay_asking_observed_on").on(table.observedOn),
  ]
);
