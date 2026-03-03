const { sql, ensureTables } = require('../../lib/db');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;

  try {
    await ensureTables();

    if (req.method === 'GET') {
      const { rows } = await sql`SELECT * FROM projects WHERE id = ${id}`;
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }
      return res.status(200).json(rows[0]);
    }

    if (req.method === 'PUT') {
      const { name, buttons } = req.body;
      const updates = [];

      if (name !== undefined) {
        await sql`UPDATE projects SET name = ${name.trim()} WHERE id = ${id}`;
      }
      if (buttons !== undefined) {
        const buttonsJson = JSON.stringify(buttons);
        await sql`UPDATE projects SET buttons = ${buttonsJson}::jsonb WHERE id = ${id}`;
      }

      const { rows } = await sql`SELECT * FROM projects WHERE id = ${id}`;
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }
      return res.status(200).json(rows[0]);
    }

    if (req.method === 'DELETE') {
      const { rowCount } = await sql`DELETE FROM projects WHERE id = ${id}`;
      if (rowCount === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }
      return res.status(200).json({ message: 'Project deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Project error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
