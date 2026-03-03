const { sql, ensureTables } = require('../../../lib/db');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensureTables();

    if (req.method === 'GET') {
      const { rows } = await sql`
        SELECT * FROM checklist_template ORDER BY sort_order ASC, id ASC
      `;
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const { label, drops_marker, color } = req.body;
      if (!label || !label.trim()) {
        return res.status(400).json({ error: 'Label is required' });
      }

      // Get next sort_order
      const { rows: maxRows } = await sql`
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM checklist_template
      `;
      const nextOrder = maxRows[0].next_order;

      const { rows } = await sql`
        INSERT INTO checklist_template (label, drops_marker, color, sort_order)
        VALUES (${label.trim()}, ${drops_marker || false}, ${color || 'Orange'}, ${nextOrder})
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
