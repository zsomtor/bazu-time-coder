const { sql } = require('./db');

// The Stream Deck target project, stored as a single app_state row. Kept in
// lib/ rather than api/projects/active.js because every file under api/ is a
// separate serverless function and the Hobby plan caps a deployment at 12 —
// /api/projects/active is served by api/projects/[id].js with id === 'active'.
const KEY = 'active_project_id';

async function getActiveProjectId() {
  const { rows } = await sql`SELECT value FROM app_state WHERE key = ${KEY}`;
  return rows[0]?.value || null;
}

async function setActiveProjectId(projectId) {
  const value = String(projectId);
  await sql`
    INSERT INTO app_state (key, value)
    VALUES (${KEY}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = ${value}
  `;
}

// Handles GET/POST on /api/projects/active. Returns true when it took the
// request, so the caller can fall through to normal project handling.
async function handleActiveProject(req, res) {
  if (req.method === 'GET') {
    const projectId = await getActiveProjectId();
    if (!projectId) {
      res.status(200).json({ project_id: null });
      return true;
    }
    const { rows } = await sql`SELECT id, name FROM projects WHERE id = ${projectId}`;
    if (rows.length === 0) {
      res.status(200).json({ project_id: null });
      return true;
    }
    res.status(200).json({ project_id: rows[0].id, name: rows[0].name });
    return true;
  }

  if (req.method === 'POST') {
    const { project_id } = req.body || {};
    if (!project_id) {
      res.status(400).json({ error: 'project_id is required' });
      return true;
    }
    await setActiveProjectId(project_id);
    res.status(200).json({ project_id });
    return true;
  }

  res.status(405).json({ error: 'Method not allowed' });
  return true;
}

module.exports = { getActiveProjectId, setActiveProjectId, handleActiveProject };
