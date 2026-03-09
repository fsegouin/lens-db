import {
  pgTable,
  serial,
  text,
  real,
  integer,
  boolean,
  jsonb,
  timestamp,
  primaryKey,
  index,
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
  manufacturer: text("manufacturer"),
  viewCount: integer("view_count").default(0),
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
    // Engagement
    viewCount: integer("view_count").default(0),
    averageRating: real("average_rating"),
    ratingCount: integer("rating_count").default(0),
    // Full specs and images as JSON
    specs: jsonb("specs").default({}),
    images: jsonb("images").default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_lenses_system").on(table.systemId),
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
    description: text("description"),
    alias: text("alias"),
    sensorType: text("sensor_type"),
    sensorSize: text("sensor_size"),
    megapixels: real("megapixels"),
    resolution: text("resolution"),
    yearIntroduced: integer("year_introduced"),
    bodyType: text("body_type"),
    weightG: real("weight_g"),
    viewCount: integer("view_count").default(0),
    specs: jsonb("specs").default({}),
    images: jsonb("images").default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_cameras_system").on(table.systemId)]
);

export const collections = pgTable("collections", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
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
