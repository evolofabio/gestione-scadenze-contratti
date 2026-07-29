'use strict';
/** Capture real app screenshots for landing page */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8766/contract_manager_dashboard.html';
const OUT = path.resolve(__dirname, '../assets/screenshots');

const shots = [
  { file: 'dashboard.png', setup: () => window.setPage('dashboard') },
  { file: 'clienti.png', setup: () => window.setPage('clienti') },
  { file: 'contratti.png', setup: () => window.setPage('contratti') },
  {
    file: 'compliance.png',
    setup: () => {
      window.setPage('compliance');
      if (typeof window.setComplianceCategoryFilter === 'function') {
        window.setComplianceCategoryFilter('unilav');
      }
    },
  },
  { file: 'calendar.png', setup: () => window.setPage('calendar') },
  { file: 'analytics.png', setup: () => window.setPage('analytics') },
  { file: 'cantieri.png', setup: () => window.setPage('cantieri') },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const b = document.getElementById('demo-banner');
    if (b) b.hidden = true;
  });

  for (const s of shots) {
    if (s.setup) {
      await page.evaluate(s.setup);
      await page.waitForTimeout(1400);
    }
    await page.screenshot({ path: path.join(OUT, s.file), fullPage: false });
    console.log('Saved', s.file);
  }

  await browser.close();
  console.log('Done →', OUT);
})();
