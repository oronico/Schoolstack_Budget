const express = require('express');
const { generateProFormaWorkbook } = require('./schoolstack_proforma_exporter_example');

const router = express.Router();

router.post('/api/pro-forma/export', async (req, res) => {
  try {
    const payload = req.body || {};

    if (!payload.schoolName) {
      return res.status(400).json({ error: 'schoolName is required' });
    }

    const buffer = await generateProFormaWorkbook(payload, {
      templatePath: require('path').join(process.cwd(), 'templates', 'SchoolStack_Prelaunch_ProForma_Template_v1.xlsx'),
    });

    const safeName = String(payload.schoolName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'school';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}-5-year-pro-forma.xlsx"`);
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('pro forma export failed', error);
    return res.status(500).json({ error: 'Failed to generate workbook' });
  }
});

module.exports = router;
