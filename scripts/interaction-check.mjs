// Smoke-tests key interactions against the offline single-file build (run `npm run build:preview-file` first).
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const ctx = await browser.newContext({ acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const url = `file://${process.cwd()}/preview-file/index.html#/`;
const results = [];
const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
await page.goto(url);

// Sketch layout essentials.
ok('critical service shown in service health', await page.getByRole('button', { name: /^Payouts: Critical/ }).isVisible());
ok('nav shows triage count', (await page.locator('.nav-count').count()) >= 1);

// Verdict leads with the most severe service and offers one next action.
ok('verdict headline names critical service', (await page.locator('.verdict-title').innerText()) === 'Payouts is critical');
await page.getByRole('button', { name: 'Investigate Payouts' }).click();
const svcCol = await page.locator('table.data tbody tr.row td:nth-child(5)').allInnerTexts();
ok('Investigate filters activity to Payouts', svcCol.length > 0 && svcCol.every((t) => t === 'Payouts'));
await page.getByLabel('Service', { exact: true }).selectOption('');

// Triage and resolve flow.
// Toolbar is just search, service and one errors toggle.
ok('toolbar has no chip filters', (await page.locator('.activity-toolbar .chip').count()) === 0);
const triageCount = async () => Number((await page.locator('.nav-item', { hasText: 'API activity' }).locator('.nav-count').innerText()).replace(/,/g, ''));
await page.getByRole('button', { name: /^Show API errors only/ }).click();
const errRows = await page.locator('tr.row td:nth-child(9)').allInnerTexts();
ok('errors toggle shows only API errors', errRows.length > 0 && errRows.every((t) => /Failed|Outcome unknown/.test(t)));
await page.getByLabel('Filter by error').selectOption('GATEWAY_TIMEOUT');
const errCodes = await page.locator('tr.row td:nth-child(7)').allInnerTexts();
ok('Error column filter narrows to one code', errCodes.length > 0 && errCodes.every((t) => t.trim() === 'GATEWAY_TIMEOUT'));
await page.getByLabel('Filter by error').selectOption('');
const before = await triageCount();
await page.locator('.expand-btn').first().click();
ok('failed row expands with diagnosis', await page.locator('.tp-cause').first().isVisible());
ok('expand button reports aria-expanded', (await page.locator('.expand-btn').first().getAttribute('aria-expanded')) === 'true');
await page.getByRole('button', { name: 'Start investigating' }).click();
ok('status moves to Investigating', (await page.locator('.tp-status').innerText()).toLowerCase() === 'investigating');
ok('extra details are collapsed by default', !(await page.locator('.tp-more').evaluate((el) => el.open)));
await page.getByRole('button', { name: /Escalate and copy handoff/ }).click();
const clip = await page.evaluate(() => navigator.clipboard.readText());
ok('escalation copies handoff with likely cause', clip.includes('Likely cause:') && clip.includes('Trace ID: demo-trace-'));
await page.getByRole('button', { name: /^Resolve/ }).click();
await page.getByLabel('Resolution').selectOption('Partner or service recovered');
await page.getByRole('button', { name: /Confirm resolve/ }).click();
ok('resolve announces status', await page.getByText(/Marked .* resolved/).isVisible());
const after = await triageCount();
ok(`needs-triage count drops (${before} → ${after})`, after < before);

// Timeouts are labelled as uncertain, not as confirmed failures.
ok('timeout shown as Outcome unknown', (await page.getByText('Outcome unknown').count()) > 0);

// Info tip explains jargon on keyboard focus.
await page.getByRole('button', { name: 'What is P95 latency?' }).focus();
ok('info tip opens on focus', await page.getByRole('tooltip').isVisible());
await page.keyboard.press('Escape');

// Slash shortcut focuses search.
await page.locator('body').click({ position: { x: 5, y: 5 } });
await page.keyboard.press('/');
ok('"/" focuses activity search', await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Search API activity'));
await page.keyboard.press('Escape');

// Successful row shows plain metadata, no triage.
await page.getByRole('button', { name: /^Show API errors only/ }).click();
const successRow = page.locator('tr.row:not(.is-failed)').filter({ hasNotText: 'Slow, succeeded' }).first();
await successRow.click();
ok('success row expands without triage', (await page.locator('.success-detail').count()) === 1 && (await page.locator('.triage').count()) === 0);

// Customer search with no results, then select.
const combo = page.getByRole('combobox', { name: 'Customer' });
await combo.click(); await combo.fill('zzz');
ok('customer search empty state', await page.getByText('No customers match').isVisible());
await combo.fill('acme'); await combo.press('Enter');
ok('customer switch updates scope', (await combo.inputValue()).includes('Acme'));
ok('dropdown has no Airwallex or All customers', await (async () => { await combo.click(); await combo.fill(''); const t = await page.getByRole('listbox').innerText(); await combo.press('Escape'); return !/Airwallex|All customers/.test(t); })());
await combo.fill('airbnb'); await combo.press('Enter');
await page.getByRole('button', { name: /^Sandbox/ }).click();
ok('missing telemetry shown as No data, never healthy', await page.getByRole('button', { name: /^Wallets: No data/ }).isVisible());

ok('scope line under heading removed', (await page.locator('.scope-chip').count()) === 0);

// Sidebar collapses to icons; hover reveals what each icon means.
await page.getByRole('button', { name: 'Collapse navigation' }).click();
await page.waitForTimeout(300);
const navW = await page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().width);
ok(`sidebar collapses to icons (${Math.round(navW)}px)`, navW <= 72);
await page.locator('.nav-item').nth(1).hover();
ok('hover shows label and meaning', await page.locator('.nav-item').nth(1).locator('.nav-tip').isVisible());
ok('collapsed links keep accessible names', (await page.locator('.nav-item').nth(1).getAttribute('aria-label'))?.startsWith('API activity:'));
await page.getByRole('button', { name: 'Expand navigation' }).click();

// Theme switcher toggles light mode and remembers it.
await page.getByRole('button', { name: 'Switch to light mode' }).click();
ok('light mode applies', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
await page.reload();
ok('theme choice persists after reload', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
await page.getByRole('button', { name: 'Switch to dark mode' }).click();

// Disabling a critical alert asks for confirmation; Cancel keeps it on.
await page.goto(url.replace('#/', '#/alerts'));
await page.getByRole('switch').first().click();
ok('disabling an alert asks for confirmation', await page.getByRole('alertdialog').isVisible());
await page.getByRole('button', { name: 'Cancel' }).click();
ok('cancel keeps alert enabled', (await page.getByRole('switch').first().getAttribute('aria-checked')) === 'true');
await page.goto(url);

// Download returns the actual dataset.
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download mock data (JSON)' }).click()]);
ok('download equals data/nium-dashboard-mock-data.json', JSON.stringify(JSON.parse(readFileSync(await dl.path(), 'utf8'))) === JSON.stringify(JSON.parse(readFileSync('data/nium-dashboard-mock-data.json', 'utf8'))));

// Reflow at 320px (400% zoom of 1280).
await page.setViewportSize({ width: 320, height: 800 });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok(`no page-level horizontal scroll at 320px (overflow ${overflow}px)`, overflow <= 0);
await page.screenshot({ path: 'screenshots/mobile.png', fullPage: false });

console.log(results.join('\n'));
console.log(errors.length ? `Page errors:\n${errors.join('\n')}` : 'No page errors');
await browser.close();
