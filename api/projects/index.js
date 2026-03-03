const { sql, ensureTables } = require('../../lib/db');

const DEFAULT_BUTTONS = JSON.stringify([
  { label: 'INTRO', color: 'Blue' },
  { label: 'ERDEKES', color: 'Orange' },
  { label: 'ROSSZ', color: 'Red' },
  { label: 'THUMBNAIL', color: 'Purple' },
  { label: 'BROLL', color: 'White' },
  { label: 'BILLINGO', color: 'Pink' }
]);

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensureTables();

    if (req.method === 'GET') {
      const { rows } = await sql`
        SELECT id, name, created_at FROM projects ORDER BY created_at DESC
      `;
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const { name } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Project name is required' });
      }
      const buttons = req.body.buttons ? JSON.stringify(req.body.buttons) : DEFAULT_BUTTONS;
      const { rows } = await sql`
        INSERT INTO projects (name, buttons)
        VALUES (${name.trim()}, ${buttons}::jsonb)
        RETURNING *
      `;
      return res.status(201).json(rows[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Projects error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
