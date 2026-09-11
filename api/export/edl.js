const { sql, ensureTables } = require('../../lib/db');

// Each app color maps to a DISTINCT DaVinci Resolve color so markers don't
// collapse into the same color after import. Yellow is the new palette color;
// Orange and White are kept only for backward compatibility with old markers
// and are given their own distinct Resolve colors too.
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

// Comment text must never break the EDL grammar: single line, no leading pipe
// or asterisk, no collapsed-into-an-event-number surprises.
function sanitize(text) {
  return String(text || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[*|\s]+/, '')
    .trim();
}

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

    // Marker line format, and why it is shaped exactly like this:
    //
    //   <note> |C:ResolveColorX |M:<name> |D:0
    //
    // Resolve takes the text before the first `|` as the marker note, so the
    // note MUST come first -- with the tags in front the Notes field imports
    // empty. It must not sit on a `* ` comment line either, because Resolve
    // copies comment lines into Notes verbatim, asterisk and all.
    //
    // The one failure mode of this otherwise proven format: a note starting
    // with a digit ("2. pont", "5. szint") makes the line look enough like an
    // EDL event record that Resolve's parser desyncs and the marker is dropped
    // or imported nameless. Prefixing such notes with "- " neutralises the
    // line start while keeping the note readable.
    //
    // `markerFormat=raw` skips that guard, for diagnosing import problems.
    const guardNoteStart = (req.query.markerFormat || '').toLowerCase() !== 'raw';

    markers.forEach((marker, index) => {
      const num = String(index + 1).padStart(3, '0');
      const tc = marker.timecode;
      const resolveColor = COLOR_MAP[marker.color] || 'ResolveColorRed';
      const markerName = sanitize(marker.name);
      let note = sanitize(marker.comment);
      if (guardNoteStart && /^\d/.test(note)) note = `- ${note}`;

      const tags = `|C:${resolveColor} |M:${markerName} |D:0`;
      edl += `${num}  001      V     C        ${tc} ${tc} ${tc} ${tc}\n`;
      edl += `${[note, tags].filter(Boolean).join(' ')}\n\n`;
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
