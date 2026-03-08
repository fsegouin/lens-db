-- Migration: Add view counts, ratings, and comparisons
-- Run against the live Neon database

-- View counts
ALTER TABLE lenses ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;
ALTER TABLE systems ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;

-- Ratings (denormalized on lenses)
ALTER TABLE lenses ADD COLUMN IF NOT EXISTS average_rating REAL;
ALTER TABLE lenses ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0;

-- Lens ratings table
CREATE TABLE IF NOT EXISTS lens_ratings (
    id SERIAL PRIMARY KEY,
    lens_id INTEGER NOT NULL REFERENCES lenses(id) ON DELETE CASCADE,
    ip_hash TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(lens_id, ip_hash)
);
CREATE INDEX IF NOT EXISTS idx_lens_ratings_lens ON lens_ratings(lens_id);

-- Lens comparisons table
CREATE TABLE IF NOT EXISTS lens_comparisons (
    id SERIAL PRIMARY KEY,
    lens_id_1 INTEGER NOT NULL REFERENCES lenses(id) ON DELETE CASCADE,
    lens_id_2 INTEGER NOT NULL REFERENCES lenses(id) ON DELETE CASCADE,
    view_count INTEGER DEFAULT 1,
    last_compared_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(lens_id_1, lens_id_2),
    CHECK(lens_id_1 < lens_id_2)
);
CREATE INDEX IF NOT EXISTS idx_lens_comparisons_views ON lens_comparisons(view_count DESC);
