// Captures screenshots and runs axe-core against each route (dev server must be running).
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173/';
const routes = (process.argv[2] ?? '/,/activity,/webhooks,/alerts,/integration').split(',');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const context = await browser.newContext({ viewport: { width: 1512, height: 982 }, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'dark' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
for (const r of routes) {
  await page.goto(`${base}#${r}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const name = r === '/' ? 'overview' : r.slice(1);
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  console.log(`${r}: ${res.violations.length} axe violations`);
  for (const v of res.violations) console.log(`  - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0].target.join(' ')}`);
}
// Expanded failed row with triage panel.
await page.goto(`${base}#/`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /^Show API errors only/ }).click();
await page.locator('.expand-btn').first().click();
await page.waitForTimeout(300);
await page.locator('.activity-panel').screenshot({ path: 'screenshots/triage-expanded.png' });
const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
console.log(`/ (triage expanded): ${res.violations.length} axe violations`);
for (const v of res.violations) console.log(`  - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0].target.join(' ')}`);
// Light theme + collapsed navigation.
await page.evaluate(() => { localStorage.setItem('nium-theme', 'light'); localStorage.setItem('nium-nav-collapsed', '1'); });
for (const r of ['/', '/activity']) {
  await page.goto(`${base}#${r}`, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `screenshots/light-${r === '/' ? 'overview' : r.slice(1)}.png`, fullPage: true });
  const lr = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  console.log(`${r} (light, collapsed nav): ${lr.violations.length} axe violations`);
  for (const v of lr.violations) console.log(`  - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0].target.join(' ')}`);
}
await page.evaluate(() => { localStorage.removeItem('nium-theme'); localStorage.removeItem('nium-nav-collapsed'); });
console.log(errors.length ? `Console errors:\n${[...new Set(errors)].join('\n')}` : 'No console errors');
await browser.close();
