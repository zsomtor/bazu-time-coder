const { sql, ensureTables } = require('../../lib/db');
const { getPusher } = require('../../lib/pusher');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensureTables();

    if (req.method === 'GET') {
      const { projectId } = req.query;
      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
      }
      const { rows } = await sql`
        SELECT * FROM markers
        WHERE project_id = ${projectId}
        ORDER BY created_at DESC
      `;
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const { project_id, timecode, color, name, comment } = req.body;
      if (!project_id || !timecode) {
        return res.status(400).json({ error: 'project_id and timecode are required' });
      }

      const { rows } = await sql`
        INSERT INTO markers (project_id, timecode, color, name, comment)
        VALUES (${project_id}, ${timecode}, ${color || 'Orange'}, ${name || ''}, ${comment || ''})
        RETURNING *
      `;

      const marker = rows[0];

      // Broadcast to all clients in this project
      try {
        const pusher = getPusher();
        await pusher.trigger(`project-${project_id}`, 'marker-added', marker);
      } catch (pusherError) {
        console.error('Pusher error:', pusherError);
        // Don't fail the request if Pusher fails
      }

      return res.status(201).json(marker);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Markers error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
