const { sql, ensureTables } = require('../../lib/db');

// Each app color maps to a DISTINCT DaVinci Resolve marker color so markers
// don't collapse into the same color after import. Yellow is the new
// palette color; Orange and White are kept only for backward compatibility
// with old markers and are given their own distinct colors too.
//
// These match DaVinci Resolve's own internal marker color names — this part
// has worked reliably across many earlier projects, so it's kept as-is.
const COLOR_MAP = {
  'Pink': 'ResolveColorPink',
  'Yellow': 'ResolveColorYellow',
  'Blue': 'ResolveColorBlue',
  'Red': 'ResolveColorRed',
  'Purple': 'ResolveColorPurple',
  // backward-compat (legacy markers)
  'Orange': 'ResolveColorSand',
  'White': 'ResolveColorCream'
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

    // Strip newlines/carriage returns from free text so a marker can never
    // spill across lines and be mistaken for a new record.
    const clean = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim();

    markers.forEach((marker, index) => {
      const num = String(index + 1).padStart(3, '0');
      const tc = marker.timecode;
      const resolveColor = COLOR_MAP[marker.color] || 'ResolveColorRed';
      const name = clean(marker.name);
      const comment = clean(marker.comment);

      edl += `${num}  001      V     C        ${tc} ${tc} ${tc} ${tc}\n`;
      // The free-text note goes on its own "* " comment line, never glued
      // in front of the |C:/|M:/|D: tags: a note that happens to start with
      // a digit (e.g. "2. pont") can otherwise read enough like a new EDL
      // event to desync DaVinci's parser and corrupt or drop the marker.
      // Both lines are prefixed with "*" so nothing here can ever be
      // mistaken for an event record regardless of what the note contains.
      if (comment && comment !== name) {
        edl += `* ${comment}\n`;
      }
      edl += `* |C:${resolveColor} |M:${name} |D:0\n\n`;
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
