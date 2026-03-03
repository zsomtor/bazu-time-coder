const { ensureTables } = require('../lib/db');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await ensureTables();
    return res.status(200).json({ message: 'Database tables created successfully' });
  } catch (error) {
    console.error('Setup error:', error);
    return res.status(500).json({ error: 'Failed to set up database', details: error.message });
  }
};
