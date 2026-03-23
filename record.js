/**
 * Agency OS - Demo Recorder
 * Sequence:
 *   1. Create character on splash screen
 *   2. Enter the office, character walks around the floor
 *   3. Add Zara (UI Engineer) + Yasmine (UX Designer) to meeting via panel
 *   4. Watch them physically walk to the meeting room
 *   5. Launch the session, type product brief, watch AI responses stream in
 *   6. Show the produced artifact (portfolio website HTML)
 *   7. Save everything as agency-demo.mp4
 *
 * Run:  OPENAI_API_KEY=<key> node record.js
 */

const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error('Set OPENAI_API_KEY env var before running.');
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Drive the player via real keyboard events dispatched to the window.
// `keys` is declared `let` in the game so it's not on window — we use
// Playwright's keyboard API which fires native keydown/keyup events.
async function walk(page, direction, ms) {
  const codeMap = { right: 'ArrowRight', left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown' };
  const code = codeMap[direction];
  await page.keyboard.down(code);
  await sleep(ms);
  await page.keyboard.up(code);
  await sleep(150); // brief stop so character animation settles
}

// Minimal in-process HTTP server so the app loads from a real origin.
function startServer(dir, port) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const fp = path.join(dir, req.url === '/' ? 'index.html' : req.url);
      fs.readFile(fp, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        const extMime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
        const mime = extMime[path.extname(fp)] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
      });
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

(async () => {
  const PORT = 4242;
  const videoDir = path.join(__dirname, '_video_tmp');
  fs.mkdirSync(videoDir, { recursive: true });

  const server = await startServer(__dirname, PORT);
  console.log('Serving on http://localhost:' + PORT);

  const browser = await chromium.launch({ headless: false, slowMo: 40 });
  const bCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
  });
  const page = await bCtx.newPage();

  // ── 1. LOAD ──────────────────────────────────────────────────────────────────
  console.log('Loading Agency OS...');
  await page.goto('http://localhost:' + PORT, { waitUntil: 'domcontentloaded' });
  await sleep(700);

  // Inject API key so no dialog interrupts the recording.
  await page.evaluate(key => {
    sessionStorage.setItem('ai_api_key', key);
    sessionStorage.setItem('ai_provider', 'openai');
  }, API_KEY);
  await sleep(300);

  // ── 2. SPLASH - character creation ───────────────────────────────────────────
  console.log('Creating character...');
  await page.waitForSelector('#playerName', { state: 'visible' });
  await sleep(400);
  await page.click('#playerName');
  await page.type('#playerName', 'Wassim', { delay: 100 });
  await sleep(500);

  // Pick non-default options so customisation looks intentional on screen.
  await page.evaluate(() => {
    const pick = (sel, idx) => document.querySelectorAll(sel)[idx] && document.querySelectorAll(sel)[idx].click();
    pick('#skinPicker > div', 1);
    pick('#hairPicker > div', 3);
    pick('#stylePicker > button', 2);
    pick('#shirtPicker > div', 0);
    updatePreview();
  });
  await sleep(900);

  await page.waitForFunction(() => !document.getElementById('spBtn').disabled);
  await sleep(300);
  await page.click('#spBtn');

  // ── 3. OFFICE - wait for agents to settle at desks ───────────────────────────
  console.log('Entering the office...');
  await page.waitForSelector('#app', { state: 'visible' });
  await sleep(4000); // agents walk from spawn edges to their desks

  // ── 4. OFFICE WALK - tour the floor ──────────────────────────────────────────
  console.log('Walking tour of the office...');
  // Click the canvas so it has focus and keyboard events land on window.
  await page.click('#gc');
  await sleep(300);

  // Head right toward the engineering & meeting wing
  await walk(page, 'right', 3000);
  await sleep(500);

  // Up toward the design zone
  await walk(page, 'up', 2500);
  await sleep(400);

  // Drift left back through the centre past marketing & support
  await walk(page, 'left', 2000);
  await sleep(400);

  // Back down to mid-floor
  await walk(page, 'down', 1600);
  await sleep(400);

  // Jog right to park near the meeting room entrance
  await walk(page, 'right', 1400);
  await sleep(800);

  // ── 5. RECRUIT - add Zara & Yasmine to meeting via in-game API ───────────────
  console.log('Calling Zara & Yasmine into the meeting...');
  await page.evaluate(() => toggleM('zara'));    // Frontend Dev / UI Engineer
  await sleep(1400);
  await page.evaluate(() => toggleM('yasmine')); // UI Designer / UX Engineer
  await sleep(1400);

  // Switch panel to Meeting tab so viewer sees the roster build up.
  await page.evaluate(() => document.querySelectorAll('.ptt')[1] && document.querySelectorAll('.ptt')[1].click());
  await sleep(3000); // watch both agents physically walk to the meeting room

  // ── 6. LAUNCH SESSION ────────────────────────────────────────────────────────
  console.log('Launching meeting session...');
  // The panel now shows the gold "Launch Session" button (.ml class).
  await page.evaluate(() => document.querySelector('.ml') && document.querySelector('.ml').click());
  await page.waitForSelector('#mov.on', { state: 'visible', timeout: 10000 });
  await sleep(1600);

  // ── 7. TYPE THE PRODUCT BRIEF ────────────────────────────────────────────────
  console.log('Typing product brief...');
  await page.click('#movChatTxt');
  const PROMPT =
    'Build me a complete, beautiful portfolio website in a single HTML file. ' +
    'Include: a full-screen animated hero with my name and tagline, a projects grid with ' +
    'card-flip hover effects, a skills section with animated progress bars, a dark/light ' +
    'mode toggle, and a minimal contact form. Modern CSS, smooth JS, zero external dependencies.';
  await page.type('#movChatTxt', PROMPT, { delay: 18 });
  await sleep(1000);

  // ── 8. SEND ──────────────────────────────────────────────────────────────────
  console.log('Sending to agents...');
  await page.click('#movSendBtn');

  // ── 9. WAIT FOR BOTH AGENTS TO REPLY ─────────────────────────────────────────
  // meetChatHistory is a `let` var so not on window. Instead:
  //   - wait for send button to become disabled (request in flight)
  //   - then wait for it to become enabled again (all replies done)
  console.log('Waiting for agents to start responding...');
  await page.waitForSelector('#movSendBtn[disabled]', { timeout: 30000 });
  console.log('Agents are typing... waiting for both to finish (up to 4 min)...');
  await page.waitForSelector('#movSendBtn:not([disabled])', { timeout: 240000 });

  console.log('Both agents replied!');
  await sleep(2500);

  // ── 10. SCROLL CHAT HISTORY so viewer reads every response ───────────────────
  await page.evaluate(() => {
    const b = document.getElementById('movChatHist');
    if (b) b.scrollTop = 0;
  });
  await sleep(700);

  for (let i = 1; i <= 8; i++) {
    await page.evaluate(function(frac) {
      const b = document.getElementById('movChatHist');
      if (b) b.scrollTop = b.scrollHeight * frac;
    }, i / 8);
    await sleep(900);
  }
  await sleep(1500);

  // ── 11. SHOW ARTIFACT (the generated HTML file) ───────────────────────────────
  const hasArtifact = await page.evaluate(() => !!document.querySelector('.mo-file-tab'));
  if (hasArtifact) {
    console.log('Opening artifact file tab...');
    await page.evaluate(() => document.querySelector('.mo-file-tab').click());
    await sleep(1800);

    // Slowly scroll through the code so the viewer can see it was really built.
    for (let i = 0; i <= 5; i++) {
      await page.evaluate(function(frac) {
        const cv = document.getElementById('movCodeView');
        if (cv) cv.scrollTop = cv.scrollHeight * frac;
      }, i / 5);
      await sleep(700);
    }
    await sleep(1500);
  } else {
    console.log('No code artifact this run - API returned prose only.');
  }

  // ── 12. OPEN PRODUCTS LAB - show the pinned sticky notes board ───────────────
  console.log('Opening Products Lab to show pinned notes...');
  await page.evaluate(() => { if (typeof openPlab === 'function') openPlab(); });
  await sleep(4000); // let the board settle and viewer can read the cards

  // Scroll through the cards so the recording captures them
  for (let i = 0; i <= 4; i++) {
    await page.evaluate(function(frac) {
      const g = document.getElementById('plabGrid');
      if (g) g.scrollTop = g.scrollHeight * frac;
    }, i / 4);
    await sleep(700);
  }
  await sleep(2000);

  // ── 13. FINAL HOLD ───────────────────────────────────────────────────────────
  await sleep(2000);

  // Must grab video path BEFORE closing the context (it finalises on close).
  const tmpVideoPath = await page.video().path();
  await bCtx.close();
  await browser.close();
  server.close();

  // ── 14. CONVERT webm -> mp4 ───────────────────────────────────────────────────
  const mp4Out = path.join(__dirname, 'agency-demo.mp4');
  console.log('Converting to MP4...');
  execSync(
    'ffmpeg -y -i "' + tmpVideoPath + '" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -movflags +faststart "' + mp4Out + '"',
    { stdio: 'inherit' }
  );

  fs.rmSync(videoDir, { recursive: true, force: true });
  console.log('\nDone! Video saved -> ' + mp4Out);

})().catch(err => {
  console.error('\nRecording failed:', err.message);
  process.exit(1);
});
