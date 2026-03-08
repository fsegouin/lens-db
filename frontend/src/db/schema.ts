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
} from "drizzle-orm/pg-core";

export const systems = pgTable("systems", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  mountType: text("mount_type"),
  manufacturer: text("manufacturer"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const lenses = pgTable(
  "lenses",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    systemId: integer("system_id").references(() => systems.id),
    description: text("description"),
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
    // Full specs and images as JSON
    specs: jsonb("specs").default({}),
    images: jsonb("images").default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_lenses_system").on(table.systemId),
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
    systemId: integer("system_id").references(() => systems.id),
    description: text("description"),
    sensorType: text("sensor_type"),
    sensorSize: text("sensor_size"),
    megapixels: real("megapixels"),
    yearIntroduced: integer("year_introduced"),
    bodyType: text("body_type"),
    specs: jsonb("specs").default({}),
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
