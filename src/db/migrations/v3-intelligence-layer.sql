-- Phase 2 Intelligence Layer Migration (v2 → v3)
-- Adds tables for CBT entries, glimmers, self-model audits, and pattern hints

PRAGMA foreign_keys = OFF;

-- CBT Entries Table
CREATE TABLE IF NOT EXISTS cbt_entries (
  id TEXT PRIMARY KEY,
  bubble_id TEXT,
  created_at INTEGER NOT NULL,
  thought TEXT NOT NULL,
  distortions TEXT, -- JSON array of DistortionKey[]
  evidence_for TEXT,
  evidence_against TEXT,
  reframe TEXT,
  tags TEXT, -- JSON array of string[]
  FOREIGN KEY (bubble_id) REFERENCES bubbles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cbt_entries_created_at ON cbt_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_cbt_entries_bubble_id ON cbt_entries(bubble_id);

-- Glimmers Table
CREATE TABLE IF NOT EXISTS glimmers (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  tone TEXT NOT NULL CHECK (tone IN ('FutureYou', 'Friend', 'Coach', 'Scientist')),
  message TEXT NOT NULL,
  cause TEXT NOT NULL,
  delivered_via TEXT NOT NULL CHECK (delivered_via IN ('text', 'tts', 'both')),
  dismissed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_glimmers_created_at ON glimmers(created_at);

-- Enhanced Reminders Table (add columns to existing)
ALTER TABLE reminders ADD COLUMN snoozes TEXT DEFAULT '[]'; -- JSON array of Snooze[]
ALTER TABLE reminders ADD COLUMN adaptive_reason TEXT; -- "Because..." explanation

-- Self-Model Audits Table
CREATE TABLE IF NOT EXISTS self_model_audits (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  change_summary TEXT NOT NULL, -- Human-readable diff
  layer TEXT NOT NULL CHECK (layer IN ('surface', 'context', 'deep')),
  user_confirmed INTEGER DEFAULT 0, -- boolean
  archived_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_self_model_audits_created_at ON self_model_audits(created_at);
CREATE INDEX IF NOT EXISTS idx_self_model_audits_layer ON self_model_audits(layer);

-- Pattern Hints Table
CREATE TABLE IF NOT EXISTS pattern_hints (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  last_updated INTEGER NOT NULL,
  layer TEXT NOT NULL CHECK (layer IN ('surface', 'context', 'deep'))
);

CREATE INDEX IF NOT EXISTS idx_pattern_hints_key ON pattern_hints(key);
CREATE INDEX IF NOT EXISTS idx_pattern_hints_confidence ON pattern_hints(confidence);
CREATE INDEX IF NOT EXISTS idx_pattern_hints_last_updated ON pattern_hints(last_updated);

-- Monthly Reviews Table
CREATE TABLE IF NOT EXISTS monthly_reviews (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL, -- YYYY-MM format
  created_at INTEGER NOT NULL,
  audit_summary TEXT, -- JSON summary of audits
  pattern_changes TEXT, -- JSON summary of pattern changes
  user_notes TEXT,
  archived_patterns TEXT -- JSON array of archived pattern IDs
);

CREATE INDEX IF NOT EXISTS idx_monthly_reviews_month ON monthly_reviews(month);

-- Consent Records Table
CREATE TABLE IF NOT EXISTS consent_records (
  id TEXT PRIMARY KEY,
  feature TEXT NOT NULL,
  granted INTEGER NOT NULL, -- boolean
  version TEXT NOT NULL DEFAULT '1.0',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_consent_records_feature ON consent_records(feature);
CREATE INDEX IF NOT EXISTS idx_consent_records_created_at ON consent_records(created_at);

-- Seed distortion types
INSERT OR IGNORE INTO app_metadata (key, value) VALUES 
('distortion_types', json_array(
  'AllOrNothing',
  'Catastrophizing', 
  'Overgeneralization',
  'MindReading',
  'ShouldStatements',
  'Labeling',
  'EmotionalReasoning',
  'FortuneTelling',
  'DisqualifyingPositive'
));

-- Enable WAL mode for better concurrent access
PRAGMA journal_mode = WAL;

-- Update schema version
UPDATE app_metadata SET value = '3' WHERE key = 'schema_version';

PRAGMA foreign_keys = ON;