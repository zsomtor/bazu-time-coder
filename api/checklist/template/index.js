const { sql, ensureTables } = require('../../../lib/db');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensureTables();

    // A projectId scopes the request to a single project's extra items.
    // Without it, the request targets the shared base template (project_id IS NULL).
    const projectId = req.query.projectId != null ? parseInt(req.query.projectId, 10) : null;
    const hasProjectId = Number.isInteger(projectId);

    if (req.method === 'GET') {
      const { rows } = hasProjectId
        ? await sql`
            SELECT * FROM checklist_template
            WHERE project_id = ${projectId}
            ORDER BY sort_order ASC, id ASC
          `
        : await sql`
            SELECT * FROM checklist_template
            WHERE project_id IS NULL
            ORDER BY sort_order ASC, id ASC
          `;
      return res.status(200).json(rows);
    }

    if (req.method === 'DELETE') {
      if (hasProjectId) {
        await sql`DELETE FROM checklist_template WHERE project_id = ${projectId}`;
        return res.status(200).json({ message: "Project's checklist items deleted" });
      }
      await sql`DELETE FROM checklist_template WHERE project_id IS NULL`;
      return res.status(200).json({ message: 'Base checklist template deleted' });
    }

    if (req.method === 'POST') {
      const { label, drops_marker, color } = req.body;
      const bodyProjectId = req.body.projectId != null ? parseInt(req.body.projectId, 10) : projectId;
      const scopedProjectId = Number.isInteger(bodyProjectId) ? bodyProjectId : null;
      if (!label || !label.trim()) {
        return res.status(400).json({ error: 'Label is required' });
      }

      // Get next sort_order within the same scope (base or this project)
      const { rows: maxRows } = scopedProjectId != null
        ? await sql`
            SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
            FROM checklist_template WHERE project_id = ${scopedProjectId}
          `
        : await sql`
            SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
            FROM checklist_template WHERE project_id IS NULL
          `;
      const nextOrder = maxRows[0].next_order;

      const { rows } = await sql`
        INSERT INTO checklist_template (project_id, label, drops_marker, color, sort_order)
        VALUES (${scopedProjectId}, ${label.trim()}, ${drops_marker === true}, ${color || 'Orange'}, ${nextOrder})
        RETURNING *
      `;
      return res.status(201).json(rows[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Checklist template error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
