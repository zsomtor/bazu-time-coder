const { sql, ensureTables } = require('../../../lib/db');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;

  try {
    await ensureTables();

    if (req.method === 'PUT') {
      const { label, drops_marker, color, sort_order } = req.body;

      const { rows } = await sql`
        UPDATE checklist_template
        SET
          label = ${(label || '').trim()},
          drops_marker = ${drops_marker === true},
          color = ${color || 'Orange'},
          sort_order = ${sort_order != null ? sort_order : 0}
        WHERE id = ${id}
        RETURNING *
      `;

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Checklist item not found' });
      }
      return res.status(200).json(rows[0]);
    }

    if (req.method === 'DELETE') {
      const { rows } = await sql`
        DELETE FROM checklist_template WHERE id = ${id} RETURNING id
      `;
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Checklist item not found' });
      }
      return res.status(200).json({ message: 'Deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Checklist template item error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
