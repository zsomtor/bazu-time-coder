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
}

module.exports = { sql, ensureTables };
