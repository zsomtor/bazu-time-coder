const { sql, ensureTables } = require('../lib/db');
const { getPusher } = require('../lib/pusher');

// Wall-clock timecode in HH:MM:SS:FF @ 25fps, Europe/Budapest local time —
// mirrors public/app.js so Stream Deck markers land on the same clock as camera timecodes.
function currentTimecode() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Budapest',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  const h = get('hour') === '24' ? '00' : get('hour');
  const m = get('minute');
  const s = get('second');
  const f = String(Math.floor(now.getMilliseconds() / 40)).padStart(2, '0');
  return `${h}:${m}:${s}:${f}`;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await ensureTables();

    const src = req.method === 'GET' ? req.query : req.body;
    const { project_id, name, color, comment } = src;

    if (!project_id || !name) {
      return res.status(400).json({ error: 'project_id and name are required' });
    }

    let markerColor = color;
    if (!markerColor) {
      const { rows: projectRows } = await sql`SELECT buttons FROM projects WHERE id = ${project_id}`;
      if (projectRows.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }
      const buttons = projectRows[0].buttons || [];
      const match = buttons.find((b) => b.label.toLowerCase() === String(name).toLowerCase());
      markerColor = match ? match.color : 'Orange';
    }

    const timecode = currentTimecode();

    const { rows } = await sql`
      INSERT INTO markers (project_id, timecode, color, name, comment)
      VALUES (${project_id}, ${timecode}, ${markerColor}, ${name}, ${comment || ''})
      RETURNING *
    `;
    const marker = rows[0];

    try {
      const pusher = getPusher();
      await pusher.trigger(`project-${project_id}`, 'marker-added', marker);
    } catch (pusherError) {
      console.error('Pusher error:', pusherError);
    }

    return res.status(201).json(marker);
  } catch (error) {
    console.error('Quick marker error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
