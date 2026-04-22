const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const logs = [];

  page.on('console', msg => {
    logs.push({ type: msg.type(), text: msg.text() });
  });

  page.on('pageerror', err => {
    logs.push({ type: 'error', text: err.message });
  });

  try {
    const url = 'http://127.0.0.1:8000/contract_manager_dashboard.html?demo=1';
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'screenshot_local.png', fullPage: true });
    console.log('Saved screenshot_local.png');
  } catch (e) {
    console.error('Error during execution:', e);
  } finally {
    fs.writeFileSync('console_capture.json', JSON.stringify(logs, null, 2));
    console.log('Saved console_capture.json');
    await browser.close();
  }
})();
