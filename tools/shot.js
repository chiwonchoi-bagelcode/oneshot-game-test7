// 스크린샷 도구: node tools/shot.js <out-prefix> [steps-json]
// steps: [{"wait":ms}|{"click":"#id"}|{"eval":"js"}|{"shot":"name"}|{"tap":[x,y]}|{"press":[x,y,ms]}]
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const path = require('path');
(async () => {
  const out = process.argv[2] || '/tmp/shot';
  const steps = JSON.parse(process.argv[3] || '[{"wait":800},{"shot":"title"}]');
  const w = +(process.env.W || 390), h = +(process.env.H || 844);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: +(process.env.DPR || 2), hasTouch: !!process.env.TOUCH, isMobile: !!process.env.TOUCH });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  for (const s of steps) {
    if (s.wait) await page.waitForTimeout(s.wait);
    if (s.click) await page.click(s.click);
    if (s.eval) { const r = await page.evaluate(s.eval); if (r !== undefined) console.log('eval:', JSON.stringify(r)); }
    if (s.tap) { if (process.env.TOUCH) await page.touchscreen.tap(s.tap[0], s.tap[1]); else await page.mouse.click(s.tap[0], s.tap[1]); }
    if (s.press) { await page.mouse.move(s.press[0], s.press[1]); await page.mouse.down(); await page.waitForTimeout(s.press[2] || 300); }
    if (s.release) await page.mouse.up();
    if (s.move) await page.mouse.move(s.move[0], s.move[1], { steps: 5 });
    if (s.shot) await page.screenshot({ path: `${out}-${s.shot}.png` });
  }
  if (errs.length) console.log(errs.join('\n'));
  await browser.close();
})();
