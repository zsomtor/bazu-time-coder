const { sql, ensureTables } = require('../../lib/db');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensureTables();

    if (req.method === 'GET') {
      const { rows } = await sql`SELECT value FROM app_state WHERE key = 'active_project_id'`;
      const projectId = rows[0]?.value || null;
      if (!projectId) {
        return res.status(200).json({ project_id: null });
      }
      const { rows: projectRows } = await sql`SELECT id, name FROM projects WHERE id = ${projectId}`;
      if (projectRows.length === 0) {
        return res.status(200).json({ project_id: null });
      }
      return res.status(200).json({ project_id: projectRows[0].id, name: projectRows[0].name });
    }

    if (req.method === 'POST') {
      const { project_id } = req.body;
      if (!project_id) {
        return res.status(400).json({ error: 'project_id is required' });
      }
      await sql`
        INSERT INTO app_state (key, value)
        VALUES ('active_project_id', ${String(project_id)})
        ON CONFLICT (key) DO UPDATE SET value = ${String(project_id)}
      `;
      return res.status(200).json({ project_id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Active project error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
