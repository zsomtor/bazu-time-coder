const { sql, ensureTables } = require('../../lib/db');
const { getPusher } = require('../../lib/pusher');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;

  try {
    await ensureTables();

    if (req.method === 'PUT') {
      const { comment, color, name } = req.body;

      // Get current marker to know the project_id
      const { rows: existing } = await sql`SELECT * FROM markers WHERE id = ${id}`;
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Marker not found' });
      }

      const marker = existing[0];
      const newComment = comment !== undefined ? comment : marker.comment;
      const newColor = color !== undefined ? color : marker.color;
      const newName = name !== undefined ? name : marker.name;

      const { rows } = await sql`
        UPDATE markers
        SET comment = ${newComment}, color = ${newColor}, name = ${newName}
        WHERE id = ${id}
        RETURNING *
      `;

      const updated = rows[0];

      try {
        const pusher = getPusher();
        await pusher.trigger(`project-${updated.project_id}`, 'marker-updated', updated);
      } catch (pusherError) {
        console.error('Pusher error:', pusherError);
      }

      return res.status(200).json(updated);
    }

    if (req.method === 'DELETE') {
      const { rows: existing } = await sql`SELECT * FROM markers WHERE id = ${id}`;
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Marker not found' });
      }

      const projectId = existing[0].project_id;
      await sql`DELETE FROM markers WHERE id = ${id}`;

      try {
        const pusher = getPusher();
        await pusher.trigger(`project-${projectId}`, 'marker-deleted', { id: parseInt(id) });
      } catch (pusherError) {
        console.error('Pusher error:', pusherError);
      }

      return res.status(200).json({ message: 'Marker deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Marker error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
