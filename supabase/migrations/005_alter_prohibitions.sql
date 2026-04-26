-- Add deleted_at column to apply soft delete to prohibitions table
ALTER TABLE prohibitions
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;