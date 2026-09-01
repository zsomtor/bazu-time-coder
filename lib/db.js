const { sql } = require('@vercel/postgres');

async function ensureTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      buttons JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS markers (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      timecode TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'Orange',
      name TEXT NOT NULL DEFAULT '',
      comment TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_markers_project_id ON markers(project_id)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS checklist_template (
      id SERIAL PRIMARY KEY,
      label TEXT NOT NULL,
      drops_marker BOOLEAN NOT NULL DEFAULT false,
      color TEXT NOT NULL DEFAULT 'Orange',
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS checklist_state (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      checklist_item_id INTEGER NOT NULL REFERENCES checklist_template(id) ON DELETE CASCADE,
      checked BOOLEAN NOT NULL DEFAULT false
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_checklist_state_project_id ON checklist_state(project_id)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `;
}

module.exports = { sql, ensureTables };
