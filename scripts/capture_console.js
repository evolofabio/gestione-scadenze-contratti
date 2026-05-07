const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const args = process.argv.slice(2);
  const strict = process.env.STRICT_CONSOLE === '1' || args.includes('--strict');
  const positional = args.filter(a => !a.startsWith('--'));
  const localUrl = `file://${path.resolve(__dirname, '..', 'contract_manager_dashboard.html')}`;
  const url = positional[0] || process.env.CAPTURE_URL || localUrl;
  const out = 'console_logs.json';
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const logs = [];
  let hasConsoleError = false;
  let hasPageError = false;
  let hasGotoError = false;
  page.on('console', msg => {
    try { logs.push({type: msg.type(), text: msg.text(), location: msg.location()}); } catch(e) { logs.push({type: msg.type(), text: msg.text()}); }
    console.log('[console]', msg.type(), msg.text());
    if (msg.type() === 'error') hasConsoleError = true;
  });
  page.on('pageerror', err => {
    logs.push({type: 'pageerror', text: err.message, stack: err.stack});
    console.error('[pageerror]', err.message);
    hasPageError = true;
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
    hasGotoError = true;
  }
  await browser.close();
  fs.writeFileSync(out, JSON.stringify(logs, null, 2));
  console.log('Saved', out);

  if (strict && (hasConsoleError || hasPageError || hasGotoError)) {
    const reasons = [];
    if (hasConsoleError) reasons.push('console error');
    if (hasPageError) reasons.push('page error');
    if (hasGotoError) reasons.push('navigation error');
    console.error('Strict check failed:', reasons.join(', '));
    process.exitCode = 1;
  }
})();
