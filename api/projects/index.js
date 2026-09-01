const { sql, ensureTables } = require('../../lib/db');
const { setActiveProjectId } = require('../../lib/active-project');

const DEFAULT_BUTTONS = JSON.stringify([
  { label: 'KEZDÉS', color: 'Purple' },
  { label: 'INTRO', color: 'Blue' },
  { label: 'BROLL', color: 'Pink' },
  { label: 'SPONSOR', color: 'Yellow' },
  { label: 'AD-SPOT', color: 'Yellow' },
  { label: 'ROSSZ', color: 'Red' }
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
      const project = rows[0];

      // Auto-populate checklist state for this project
      try {
        await sql`
          INSERT INTO checklist_state (project_id, checklist_item_id, checked)
          SELECT ${project.id}, id, false FROM checklist_template
          WHERE project_id IS NULL
        `;
      } catch (clErr) {
        console.warn('Checklist state population skipped:', clErr.message);
      }

      // A newly created project is almost always the one about to be recorded,
      // so point Stream Deck at it. Unlike opening a project, creating one is
      // never incidental — you can't do it just to glance at something.
      // Non-fatal: the project itself is created either way, and the UI reads
      // the real target back, so a failure here shows as an unset target
      // rather than a wrong one.
      try {
        await setActiveProjectId(project.id);
      } catch (targetErr) {
        console.warn('Stream Deck target not updated:', targetErr.message);
      }

      return res.status(201).json(project);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Projects error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
