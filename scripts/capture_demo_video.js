'use strict';
/**
 * Registra un video walkthrough della demo ProrogaPro per social / marketing.
 *
 * Usage:
 *   node scripts/capture_demo_video.js [url]
 *   npm run demo-video
 *
 * Output:
 *   assets/video/prorogapro-demo-16x9.mp4   (LinkedIn, YouTube, sito)
 *   assets/video/prorogapro-demo-9x16.mp4   (Reels, Stories, TikTok)
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DEMO_ROOT = path.resolve(ROOT, '../Gestione-scadenze-contratti-DEMO');
const OUT_DIR = path.join(ROOT, 'assets', 'video');
const RAW_DIR = path.join(OUT_DIR, '_raw');

const BASE_ARG = process.argv[2];
const PORT = 8767;

/** Sequenza demo: navigazione + durata (ms) */
const SCENES = [
  { label: 'Dashboard cockpit', nav: 'nav-dashboard', wait: 3200 },
  { label: 'Contratti', nav: 'nav-contratti', wait: 2800 },
  { label: 'Scadenziario', nav: 'nav-compliance', wait: 3200, after: async (page) => {
    await page.evaluate(() => {
      if (typeof window.setComplianceCategoryFilter === 'function') window.setComplianceCategoryFilter('unilav');
      if (typeof window.setComplianceTimeFilter === 'function') window.setComplianceTimeFilter('week');
    });
    await page.waitForTimeout(1200);
  }},
  { label: 'Clienti', nav: 'nav-clienti', wait: 2800 },
  { label: 'Calendario', nav: 'nav-calendar', wait: 2400 },
  { label: 'Analytics', nav: 'nav-analytics', wait: 2400 },
];

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}`))));
    p.on('error', reject);
  });
}

function ensureDemoAssets() {
  const demoAssets = path.join(DEMO_ROOT, 'assets');
  const saasAssets = path.join(ROOT, 'assets');
  if (!fs.existsSync(DEMO_ROOT)) {
    console.warn('Repo demo non trovato, uso URL remoto');
    return null;
  }
  if (!fs.existsSync(demoAssets) && fs.existsSync(saasAssets)) {
    fs.cpSync(saasAssets, demoAssets, { recursive: true });
    console.log('Asset copiati in demo →', demoAssets);
  }
  return DEMO_ROOT;
}

function startStaticServer(dir) {
  return new Promise((resolve) => {
    const proc = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
      cwd: dir,
      stdio: 'ignore',
    });
    setTimeout(() => resolve(proc), 800);
  });
}

async function waitApp(page) {
  await page.goto(page._baseUrl, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2200);
  await page.waitForFunction(() => {
    const pc = document.getElementById('page-content');
    return pc && pc.innerHTML.length > 400;
  }, { timeout: 20000 });
  await page.evaluate(() => {
    const b = document.getElementById('demo-banner');
    if (b) b.hidden = true;
    document.body.classList.remove('nav-menu-open');
  });
}

async function recordWalkthrough(baseUrl, size) {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: 1,
    recordVideo: {
      dir: RAW_DIR,
      size,
    },
    locale: 'it-IT',
  });
  const page = await context.newPage();
  page._baseUrl = baseUrl;

  await waitApp(page);

  for (const scene of SCENES) {
    await page.click(`#${scene.nav}`);
    await page.waitForTimeout(700);
    if (scene.after) await scene.after(page);
    await page.waitForTimeout(scene.wait);
  }

  // Scroll leggero dashboard per dinamismo
  await page.click('#nav-dashboard');
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const main = document.getElementById('page-content');
    if (main) main.scrollBy({ top: 180, behavior: 'smooth' });
  });
  await page.waitForTimeout(1800);

  const video = page.video();
  await context.close();
  await browser.close();
  return video.path();
}

async function postProcess(rawWebm, outMp4, opts) {
  const { w, h } = opts;
  const introDur = 2.8;
  const outroDur = 3.2;
  const tmpIntro = path.join(RAW_DIR, `intro-${w}x${h}.mp4`);
  const tmpOutro = path.join(RAW_DIR, `outro-${w}x${h}.mp4`);
  const tmpMain = path.join(RAW_DIR, `main-${w}x${h}.mp4`);
  const introPng = path.join(RAW_DIR, `intro-${w}x${h}.png`);
  const outroPng = path.join(RAW_DIR, `outro-${w}x${h}.png`);
  const cardPy = path.join(__dirname, 'generate_video_card.py');

  await run('python3', [cardPy, 'intro', introPng, String(w), String(h)]);
  await run('python3', [cardPy, 'outro', outroPng, String(w), String(h)]);

  await run('ffmpeg', ['-y', '-loop', '1', '-i', introPng, '-t', String(introDur), '-vf', `scale=${w}:${h}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', tmpIntro]);
  await run('ffmpeg', ['-y', '-i', rawWebm, '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0xf3f0e7`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', tmpMain]);
  await run('ffmpeg', ['-y', '-loop', '1', '-i', outroPng, '-t', String(outroDur), '-vf', `scale=${w}:${h}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', tmpOutro]);

  const listFile = path.join(RAW_DIR, `concat-${w}.txt`);
  fs.writeFileSync(listFile, [`file '${tmpIntro}'`, `file '${tmpMain}'`, `file '${tmpOutro}'`].join('\n'));

  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outMp4]);

  console.log('✓', outMp4);
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let baseUrl = BASE_ARG;
  let serverProc = null;

  if (!baseUrl) {
    const demoDir = ensureDemoAssets();
    if (demoDir) {
      serverProc = await startStaticServer(demoDir);
      baseUrl = `http://127.0.0.1:${PORT}/contract_manager_dashboard.html`;
    } else {
      baseUrl = 'https://evolofabio.github.io/Gestione-scadenze-contratti-DEMO/contract_manager_dashboard.html';
    }
  }

  console.log('Recording demo from', baseUrl);

  try {
    // 16:9 — LinkedIn, YouTube, embed sito
    const raw169 = await recordWalkthrough(baseUrl, { width: 1920, height: 1080 });
    await postProcess(raw169, path.join(OUT_DIR, 'prorogapro-demo-16x9.mp4'), {
      w: 1920, h: 1080,
    });

    // 9:16 — Reels / Stories / TikTok
    const raw916 = await recordWalkthrough(baseUrl, { width: 1080, height: 1920 });
    await postProcess(raw916, path.join(OUT_DIR, 'prorogapro-demo-9x16.mp4'), {
      w: 1080, h: 1920,
    });

    console.log('\nVideo pronti in', OUT_DIR);
  } finally {
    if (serverProc) serverProc.kill('SIGTERM');
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
