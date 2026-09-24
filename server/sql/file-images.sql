-- Apply to Replit's development PostgreSQL database. Replit Publish promotes
-- the development schema to the production database; never copy file rows.
-- These are byte-for-byte SQLite images, not a conversion to PostgreSQL tables.
CREATE TABLE IF NOT EXISTS buildflow_file_epoch (
  id integer PRIMARY KEY CHECK (id = 1),
  epoch bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS buildflow_files (
  filename text PRIMARY KEY,
  contents bytea NOT NULL
);

CREATE TABLE IF NOT EXISTS buildflow_backups (
  filename text PRIMARY KEY,
  contents bytea NOT NULL
);

-- A marker independent of row count: deleting every backup must not import
-- stale local snapshots at the next start.
CREATE TABLE IF NOT EXISTS buildflow_backup_import (
  id integer PRIMARY KEY CHECK (id = 1)
);