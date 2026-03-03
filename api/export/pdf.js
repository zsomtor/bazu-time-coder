const { sql, ensureTables } = require('../../lib/db');
const PDFDocument = require('pdfkit');

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

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 60, left: 40, right: 40 },
      bufferPages: true
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      const filename = `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.status(200).send(pdfBuffer);
    });

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text(project.name, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('#666666')
      .text(`Generated: ${new Date().toLocaleDateString('en-GB')} | Markers: ${markers.length}`, { align: 'center' });
    doc.moveDown(1);

    // Table setup
    const tableLeft = 40;
    const colWidths = [35, 90, 55, 80, 255];
    const headers = ['No.', 'Timecode In', 'Color', 'Name', 'Comment'];
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const rowHeight = 22;

    function drawTableHeader(y) {
      // Header background
      doc.rect(tableLeft, y, tableWidth, rowHeight).fill('#333333');
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');

      let x = tableLeft + 5;
      headers.forEach((header, i) => {
        doc.text(header, x, y + 6, { width: colWidths[i] - 10, align: 'left' });
        x += colWidths[i];
      });

      return y + rowHeight;
    }

    function drawTableRow(marker, index, y) {
      // Alternating row shading
      if (index % 2 === 0) {
        doc.rect(tableLeft, y, tableWidth, rowHeight).fill('#f5f5f5');
      } else {
        doc.rect(tableLeft, y, tableWidth, rowHeight).fill('#ffffff');
      }

      doc.fillColor('#222222').fontSize(8).font('Helvetica');

      let x = tableLeft + 5;
      const values = [
        String(index + 1),
        marker.timecode,
        marker.color,
        marker.name || '',
        marker.comment || ''
      ];

      values.forEach((val, i) => {
        doc.text(val, x, y + 6, { width: colWidths[i] - 10, align: 'left' });
        x += colWidths[i];
      });

      return y + rowHeight;
    }

    let currentY = doc.y;
    currentY = drawTableHeader(currentY);

    const pageBottom = doc.page.height - doc.page.margins.bottom - 30;

    for (let i = 0; i < markers.length; i++) {
      if (currentY + rowHeight > pageBottom) {
        doc.addPage();
        currentY = doc.page.margins.top;
        currentY = drawTableHeader(currentY);
      }
      currentY = drawTableRow(markers[i], i, currentY);
    }

    // Draw table border
    const tableTop = doc.page.margins.top;

    // Add footer to all pages
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      const footerY = doc.page.height - 40;
      doc.fontSize(8).font('Helvetica').fillColor('#999999');
      doc.text(
        `Page ${i + 1} of ${pages.count}`,
        tableLeft,
        footerY,
        { width: tableWidth / 3, align: 'left' }
      );
      doc.text(
        'Bazu Time Coder',
        tableLeft + tableWidth / 3,
        footerY,
        { width: tableWidth / 3, align: 'center' }
      );
      doc.text(
        new Date().toLocaleDateString('en-GB'),
        tableLeft + (tableWidth / 3) * 2,
        footerY,
        { width: tableWidth / 3, align: 'right' }
      );
    }

    doc.end();
  } catch (error) {
    console.error('PDF export error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
