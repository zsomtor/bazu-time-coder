const { sql, ensureTables } = require('../../lib/db');

// Each app color maps to a DISTINCT DaVinci Resolve color so markers don't
// collapse into the same color after import. Two representations are written
// for every marker, because Resolve's EDL importer is picky and undocumented:
//
//   * LOC: <tc> <COLOR> <name>        -> position + name (Resolve's own export
//                                        format; proven to place markers right)
//   * |C:ResolveColorX |M:.. |D:0     -> the tag form that has historically
//                                        carried the color correctly
//
// Both live on their own `*` comment lines. That is the critical part: the old
// exporter put the free-text note at the START of a line, and when a note began
// with a digit ("2. pont") Resolve mistook it for a new EDL event and either
// dropped the marker or stripped its name/color.
const LOC_COLOR = {
  'Pink': 'PINK',
  'Yellow': 'YELLOW',
  'Blue': 'BLUE',
  'Red': 'RED',
  'Purple': 'PURPLE',
  // backward-compat (legacy markers)
  'Orange': 'SAND',
  'White': 'CREAM'
};

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

    // Resolve puts every `*` comment line verbatim into the marker's Notes
    // field, but silently consumes the |C:/|M:/|D: tags from whatever line
    // they sit on. So the tags go FIRST on an asterisk-free line and the note
    // follows them: the line starts with `|`, which can never be mistaken for
    // an EDL event record (the original bug, hit by notes like "2. pont"),
    // and the Notes field ends up holding just the clean note text.
    //
    // `markerFormat` keeps the alternatives reachable for testing in Resolve
    // without a redeploy: 'tagfirst' (default), 'tag', 'loc', 'both', 'legacy'.
    const markerFormat = (req.query.markerFormat || 'tagfirst').toLowerCase();

    markers.forEach((marker, index) => {
      const num = String(index + 1).padStart(3, '0');
      const tc = marker.timecode;
      const resolveColor = COLOR_MAP[marker.color] || 'ResolveColorRed';
      const locColor = LOC_COLOR[marker.color] || 'RED';
      const note = sanitize(marker.comment);
      const markerName = sanitize(marker.name);
      const tags = `|C:${resolveColor} |M:${markerName} |D:0`;

      edl += `${num}  001      V     C        ${tc} ${tc} ${tc} ${tc}\n`;

      if (markerFormat === 'loc' || markerFormat === 'both') {
        const locText = [markerName, note].filter(Boolean).join(': ') || 'Marker';
        edl += `* LOC: ${tc} ${locColor} ${locText}\n`;
      }

      if (markerFormat === 'loc') {
        // nothing else; LOC carries name and colour on its own
      } else if (markerFormat === 'tag' || markerFormat === 'both') {
        if (note) edl += `* ${note}\n`;
        edl += `* ${tags}\n`;
      } else if (markerFormat === 'legacy') {
        edl += `${[note, tags].filter(Boolean).join(' ')}\n`;
      } else {
        edl += `${[tags, note].filter(Boolean).join(' ')}\n`;
      }

      edl += `\n`;
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
