const { sql, ensureTables } = require('../../../lib/db');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;

  try {
    await ensureTables();

    if (req.method === 'PUT') {
      const { label, drops_marker, color, sort_order } = req.body;

      const updates = [];
      const values = {};

      if (label !== undefined) { values.label = label.trim(); }
      if (drops_marker !== undefined) { values.drops_marker = drops_marker; }
      if (color !== undefined) { values.color = color; }
      if (sort_order !== undefined) { values.sort_order = sort_order; }

      // Build update dynamically
      const { rows } = await sql`
        UPDATE checklist_template
        SET
          label = COALESCE(${values.label !== undefined ? values.label : null}, label),
          drops_marker = COALESCE(${values.drops_marker !== undefined ? values.drops_marker : null}, drops_marker),
          color = COALESCE(${values.color !== undefined ? values.color : null}, color),
          sort_order = COALESCE(${values.sort_order !== undefined ? values.sort_order : null}, sort_order)
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
