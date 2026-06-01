const { sql: rawSql } = require('@vercel/postgres');

// Neon's control plane occasionally returns transient errors when waking a
// cold/paused database. The error payload carries `neon:retryable: true` (and
// the message is usually "Control plane request failed"). @vercel/postgres
// doesn't retry these on its own, so we wrap the tagged template helper.
const MAX_ATTEMPTS = 7;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 4000;

function isRetryable(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  if (msg.includes('neon:retryable":true')) return true;
  if (msg.includes('Control plane request failed')) return true;
  if (msg.includes('fetch failed')) return true;
  if (msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT')) return true;
  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sql(strings, ...values) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await rawSql(strings, ...values);
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) throw err;
      const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
      console.warn(`DB query failed (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${delay}ms:`, err.message);
      await sleep(delay);
    }
  }
  throw lastErr;
}

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
}

module.exports = { sql, ensureTables };
