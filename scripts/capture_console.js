const fs = require('fs');
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2] || 'https://evolofabio.github.io/gestione-scadenze-contratti/';
  const out = 'console_logs.json';
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const logs = [];
  page.on('console', msg => {
    try { logs.push({type: msg.type(), text: msg.text(), location: msg.location()}); } catch(e) { logs.push({type: msg.type(), text: msg.text()}); }
    console.log('[console]', msg.type(), msg.text());
  });
  page.on('pageerror', err => {
    logs.push({type: 'pageerror', text: err.message, stack: err.stack});
    console.error('[pageerror]', err.message);
  });
  page.on('requestfailed', req => {
    const f = req.failure ? req.failure() : null;
    logs.push({type: 'requestfailed', url: req.url(), failure: f});
    console.warn('[requestfailed]', req.url(), f && f.errorText);
  });
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);
  } catch(e) {
    console.error('goto error', e.message);
    logs.push({type:'goto-error', text: e.message});
  }
  await browser.close();
  fs.writeFileSync(out, JSON.stringify(logs, null, 2));
  console.log('Saved', out);
})();
