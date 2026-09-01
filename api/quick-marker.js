const { sql, ensureTables } = require('../lib/db');
const { getActiveProjectId, getOffsetSeconds } = require('../lib/active-project');
const { getPusher } = require('../lib/pusher');

const FPS = 25;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Milliseconds since local midnight, Europe/Budapest — the same wall clock the
// app's on-screen timecode runs on, and the one the cameras are set to.
function budapestMsSinceMidnight(now) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Budapest',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  const h = get('hour') === '24' ? 0 : parseInt(get('hour'), 10);
  return ((h * 60 + parseInt(get('minute'), 10)) * 60 + parseInt(get('second'), 10)) * 1000
    + now.getMilliseconds();
}

// A caller-supplied capture time, as wall clock: HH:MM:SS, HH:MM:SS.mmm or
// HH:MM:SS:FF. Shortcuts can produce the first two with a Format Date action,
// and sending it skips every millisecond of network and cold-start latency.
function parseWallClock(value) {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,3})|:(\d{1,2}))?$/.exec(String(value).trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const s = parseInt(m[3], 10);
  if (h > 23 || min > 59 || s > 59) return null;
  let ms = 0;
  if (m[4] !== undefined) {
    ms = parseInt(m[4].padEnd(3, '0'), 10);
  } else if (m[5] !== undefined) {
    const frames = parseInt(m[5], 10);
    if (frames >= FPS) return null;
    ms = Math.round((frames * 1000) / FPS);
  }
  return ((h * 60 + min) * 60 + s) * 1000 + ms;
}

function formatTimecode(msSinceMidnight) {
  const ms = ((msSinceMidnight % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY;
  const totalSeconds = Math.floor(ms / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return [
    pad(Math.floor(totalSeconds / 3600)),
    pad(Math.floor(totalSeconds / 60) % 60),
    pad(totalSeconds % 60),
    pad(Math.floor((ms % 1000) / (1000 / FPS)))
  ].join(':');
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await ensureTables();

    const src = req.method === 'GET' ? req.query : req.body;
    const { name, color, comment, tc, offset } = src;
    let { project_id } = src;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    // Capture time: the caller's own clock when it sent one, otherwise ours.
    let captureMs;
    if (tc !== undefined && tc !== '') {
      captureMs = parseWallClock(tc);
      if (captureMs === null) {
        return res.status(400).json({ error: `tc must be HH:MM:SS, HH:MM:SS.mmm or HH:MM:SS:FF (got "${tc}")` });
      }
    } else {
      captureMs = budapestMsSinceMidnight(new Date());
    }

    // Latency compensation. A per-request offset wins over the stored default
    // so a single button can be tuned separately from the rest.
    let offsetSeconds;
    if (offset !== undefined && offset !== '') {
      offsetSeconds = parseFloat(offset);
      if (!Number.isFinite(offsetSeconds) || Math.abs(offsetSeconds) > 60) {
        return res.status(400).json({ error: 'offset must be a number between -60 and 60 seconds' });
      }
    } else {
      offsetSeconds = await getOffsetSeconds();
    }

    if (!project_id) {
      project_id = await getActiveProjectId();
      if (!project_id) {
        return res.status(400).json({ error: 'No Stream Deck target set. Open a project in the web app and press "Set as Stream Deck target".' });
      }
    }

    // Always resolve the project first: the target can be stale (project
    // deleted since it was set), and a bare INSERT would fail the foreign key
    // with an opaque 500 instead of telling the caller what's wrong.
    const { rows: projectRows } = await sql`SELECT id, buttons FROM projects WHERE id = ${project_id}`;
    if (projectRows.length === 0) {
      return res.status(404).json({ error: `Project ${project_id} not found. Set a Stream Deck target in the web app.` });
    }
    project_id = projectRows[0].id;

    let markerColor = color;
    if (!markerColor) {
      const buttons = projectRows[0].buttons || [];
      const match = buttons.find((b) => String(b.label || '').toLowerCase() === String(name).toLowerCase());
      markerColor = match ? match.color : 'Orange';
    }

    const timecode = formatTimecode(captureMs + offsetSeconds * 1000);

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

    // latency_ms is the round trip the caller's clock did not see: how late the
    // request arrived relative to the tc it sent. Useful for tuning the offset.
    const latencyMs = tc !== undefined && tc !== ''
      ? budapestMsSinceMidnight(new Date()) - captureMs
      : null;

    return res.status(201).json({ ...marker, offset_applied: offsetSeconds, latency_ms: latencyMs });
  } catch (error) {
    console.error('Quick marker error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
