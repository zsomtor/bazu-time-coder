const { sql } = require('./db');

// Stream Deck settings, stored as app_state rows. Kept in lib/ rather than
// api/projects/active.js because every file under api/ is a separate
// serverless function and the Hobby plan caps a deployment at 12 —
// /api/projects/active is served by api/projects/[id].js with id === 'active'.
const PROJECT_KEY = 'active_project_id';
const OFFSET_KEY = 'quick_marker_offset';

// Starting point for the press-to-request delay, before anyone measures their
// own setup: roughly the time a Stream Deck key press needs to launch a
// shortcut on macOS. An explicitly stored 0 still means "no compensation".
const DEFAULT_OFFSET_SECONDS = -1;

async function readState(key) {
  const { rows } = await sql`SELECT value FROM app_state WHERE key = ${key}`;
  return rows[0]?.value ?? null;
}

async function writeState(key, value) {
  const text = String(value);
  await sql`
    INSERT INTO app_state (key, value)
    VALUES (${key}, ${text})
    ON CONFLICT (key) DO UPDATE SET value = ${text}
  `;
}

async function getActiveProjectId() {
  return readState(PROJECT_KEY);
}

async function setActiveProjectId(projectId) {
  await writeState(PROJECT_KEY, projectId);
}

// Seconds subtracted from a quick-marker's capture time to compensate for the
// press-to-request latency (Stream Deck key → Shortcuts launch → HTTP). A
// negative offset moves the marker earlier, which is what you want here.
async function getOffsetSeconds() {
  const raw = await readState(OFFSET_KEY);
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_OFFSET_SECONDS;
}

async function setOffsetSeconds(seconds) {
  await writeState(OFFSET_KEY, seconds);
}

// Handles GET/POST on /api/projects/active. Returns true when it took the
// request, so the caller can fall through to normal project handling.
async function handleActiveProject(req, res) {
  if (req.method === 'GET') {
    const offset = await getOffsetSeconds();
    const projectId = await getActiveProjectId();
    if (!projectId) {
      res.status(200).json({ project_id: null, offset });
      return true;
    }
    const { rows } = await sql`SELECT id, name FROM projects WHERE id = ${projectId}`;
    if (rows.length === 0) {
      res.status(200).json({ project_id: null, offset });
      return true;
    }
    res.status(200).json({ project_id: rows[0].id, name: rows[0].name, offset });
    return true;
  }

  if (req.method === 'POST') {
    const { project_id, offset } = req.body || {};
    if (project_id === undefined && offset === undefined) {
      res.status(400).json({ error: 'project_id or offset is required' });
      return true;
    }

    if (offset !== undefined) {
      const parsed = parseFloat(offset);
      if (!Number.isFinite(parsed) || Math.abs(parsed) > 60) {
        res.status(400).json({ error: 'offset must be a number between -60 and 60 seconds' });
        return true;
      }
      await setOffsetSeconds(parsed);
    }
    if (project_id !== undefined) {
      await setActiveProjectId(project_id);
    }

    res.status(200).json({
      project_id: project_id !== undefined ? project_id : await getActiveProjectId(),
      offset: await getOffsetSeconds()
    });
    return true;
  }

  res.status(405).json({ error: 'Method not allowed' });
  return true;
}

module.exports = {
  DEFAULT_OFFSET_SECONDS,
  getActiveProjectId,
  setActiveProjectId,
  getOffsetSeconds,
  setOffsetSeconds,
  handleActiveProject
};
