const { sql, ensureTables } = require('../../lib/db');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensureTables();

    if (req.method === 'GET') {
      const { projectId } = req.query;
      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
      }

      // Join with template to get full item info + checked state
      const { rows } = await sql`
        SELECT
          ct.id,
          ct.label,
          ct.drops_marker,
          ct.color,
          ct.sort_order,
          COALESCE(cs.checked, false) AS checked,
          cs.id AS state_id
        FROM checklist_template ct
        LEFT JOIN checklist_state cs
          ON cs.checklist_item_id = ct.id AND cs.project_id = ${projectId}
        ORDER BY ct.sort_order ASC, ct.id ASC
      `;
      return res.status(200).json(rows);
    }

    if (req.method === 'PUT') {
      const { projectId, checklist_item_id, checked } = req.body;
      if (!projectId || !checklist_item_id) {
        return res.status(400).json({ error: 'projectId and checklist_item_id are required' });
      }

      // Upsert: insert if missing, update if exists
      const { rows: existing } = await sql`
        SELECT id FROM checklist_state
        WHERE project_id = ${projectId} AND checklist_item_id = ${checklist_item_id}
      `;

      let result;
      if (existing.length > 0) {
        const { rows } = await sql`
          UPDATE checklist_state
          SET checked = ${checked}
          WHERE project_id = ${projectId} AND checklist_item_id = ${checklist_item_id}
          RETURNING *
        `;
        result = rows[0];
      } else {
        const { rows } = await sql`
          INSERT INTO checklist_state (project_id, checklist_item_id, checked)
          VALUES (${projectId}, ${checklist_item_id}, ${checked})
          RETURNING *
        `;
        result = rows[0];
      }

      return res.status(200).json(result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Checklist state error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
