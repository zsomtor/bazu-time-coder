const { sql, ensureTables } = require('../../lib/db');

const COLOR_MAP = {
  'Orange': 'ResolveColorRed',
  'Blue': 'ResolveColorBlue',
  'Purple': 'ResolveColorPurple',
  'White': 'ResolveColorBlue',
  'Pink': 'ResolveColorPink',
  'Red': 'ResolveColorRed'
};

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { projectId } = req.query;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  try {
    await ensureTables();

    const { rows: projects } = await sql`SELECT * FROM projects WHERE id = ${projectId}`;
    if (projects.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const project = projects[0];

    const { rows: markers } = await sql`
      SELECT * FROM markers
      WHERE project_id = ${projectId}
      ORDER BY timecode ASC
    `;

    let edl = `TITLE: ${project.name}\n`;
    edl += `FCM: NON-DROP FRAME\n\n`;

    markers.forEach((marker, index) => {
      const num = String(index + 1).padStart(3, '0');
      const tc = marker.timecode;
      const resolveColor = COLOR_MAP[marker.color] || 'ResolveColorRed';
      const comment = marker.comment || marker.name || '';
      const markerName = marker.name || '';

      edl += `${num}  001      V     C        ${tc} ${tc} ${tc} ${tc}\n`;
      edl += `${comment} |C:${resolveColor} |M:${markerName} |D:0\n\n`;
    });

    const filename = `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.edl`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(edl);
  } catch (error) {
    console.error('EDL export error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
