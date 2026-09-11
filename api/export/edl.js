const { sql, ensureTables } = require('../../lib/db');

// Each app color maps to a DISTINCT DaVinci Resolve marker color so markers
// don't collapse into the same color after import. Yellow is the new
// palette color; Orange and White are kept only for backward compatibility
// with old markers and are given their own distinct colors too.
//
// These are plain color names for the standard CMX3600 "* LOC:" locator
// comment (see below) — NOT the older "|C:ResolveColorX |M: |D:" tag format
// this file used to emit. That format put the marker's free-text note
// directly in front of the tags with no delimiter marking the line as a
// comment, and DaVinci's EDL parser would silently drop or corrupt markers
// depending on the note text (e.g. notes starting with a digit, like
// "2. pont", read enough like a new event line to desync the parser).
// "* LOC:" is a single self-contained comment line per marker, independent
// of any edit event, so there's nothing for stray note text to collide with.
const COLOR_MAP = {
  'Pink': 'PINK',
  'Yellow': 'YELLOW',
  'Blue': 'BLUE',
  'Red': 'RED',
  'Purple': 'PURPLE',
  // backward-compat (legacy markers)
  'Orange': 'ORANGE',
  'White': 'WHITE'
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
      const color = COLOR_MAP[marker.color] || 'RED';
      const name = clean(marker.name);
      const comment = clean(marker.comment);
      const text = name && comment ? `${name}: ${comment}` : (name || comment);

      edl += `${num}  001      V     C        ${tc} ${tc} ${tc} ${tc}\n`;
      edl += `* LOC: ${tc} ${color}   ${text}\n\n`;
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
