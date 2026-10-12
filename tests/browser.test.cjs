/* SPDX-License-Identifier: MIT */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const fixture = fs.readFileSync(path.join(__dirname, 'editor.html'), 'utf8');
let browser;
before(async () => { browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
}); });
after(async () => { await browser?.close(); });

async function open(html = fixture) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.setContent(html);
  await page.evaluate(() => {
    window.mockSettings = { enabled: true, offset: 0 };
    window.storageListeners = [];
    window.messageListeners = [];
    window.chrome = {
      storage: {
        local: { get: async defaults => ({ ...defaults, ...window.mockSettings }) },
        onChanged: { addListener: fn => window.storageListeners.push(fn) }
      },
      runtime: { onMessage: { addListener: fn => window.messageListeners.push(fn) } }
    };
    window.changeSettings = changes => {
      const event = {};
      for (const [key, value] of Object.entries(changes)) {
        event[key] = { oldValue: window.mockSettings[key], newValue: value };
        window.mockSettings[key] = value;
      }
      for (const listener of window.storageListeners) listener(event, 'local');
    };
    window.sendExtensionMessage = type => new Promise(resolve => {
      for (const listener of window.messageListeners) listener({ type }, {}, resolve);
    });
  });
  await page.addStyleTag({ path: path.join(root, 'extension/content.css') });
  await page.addScriptTag({ path: path.join(root, 'extension/content.js') });
  await page.waitForTimeout(80);
  return page;
}
async function scroll(page, y) {
  await page.evaluate(value => window.scrollTo(0, value), y);
  await page.waitForTimeout(80);
}
async function pinned(page) { return page.locator('#toolbar').getAttribute('data-lft-pinned'); }

test('pins under a fixed header, preserves layout, restores when scrolling up', async () => {
  const page = await open();
  const before = await page.locator('#editor').boundingBox();
  assert.equal(await pinned(page), null);
  await scroll(page, 440);
  assert.equal(await pinned(page), '');
  const toolbar = await page.locator('#toolbar').boundingBox();
  const editor = await page.locator('#editor').boundingBox();
  assert.equal(toolbar.y, 56);
  assert.ok(Math.abs(editor.y + 440 - before.y) < 1, 'no content jump');
  await scroll(page, 0);
  assert.equal(await pinned(page), null);
  assert.equal(await page.locator('[data-lft-placeholder]').count(), 0);
  await page.close();
});

test('original formatting handlers and the selected text survive pinning', async () => {
  const page = await open();
  await scroll(page, 440);
  await page.evaluate(() => {
    const target = document.querySelector('#selection-target');
    target.closest('[contenteditable]').focus();
    const range = document.createRange(); range.selectNodeContents(target);
    getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  await page.locator('#bold').click();
  assert.equal(await page.evaluate(() => window.boldClicks), 1);
  assert.equal(await page.locator('#selection-target b, #selection-target strong').count(), 1);
  await page.close();
});

test('settings change spacing and disabling restores prior inline styles', async () => {
  const page = await open(fixture.replace('id="toolbar"', 'id="toolbar" style="top: 3px; width: 100%"'));
  await scroll(page, 440);
  await page.evaluate(() => window.changeSettings({ offset: 32 }));
  await page.waitForTimeout(80);
  assert.equal((await page.locator('#toolbar').boundingBox()).y, 88);
  await page.evaluate(() => window.changeSettings({ enabled: false }));
  await page.waitForTimeout(80);
  assert.equal(await pinned(page), null);
  assert.equal(await page.locator('#toolbar').evaluate(node => node.style.top), '3px');
  assert.equal(await page.locator('#toolbar').evaluate(node => node.style.width), '100%');
  await page.evaluate(() => window.changeSettings({ enabled: true }));
  await page.waitForTimeout(80);
  assert.equal(await pinned(page), '');
  await page.close();
});

test('toolbar stops floating after the article ends', async () => {
  const page = await open();
  await scroll(page, 2600);
  assert.equal(await pinned(page), null);
  await page.close();
});

test('uses the article body instead of a shorter editable title', async () => {
  const page = await open(fixture.replace('<div id="editor"', '<div contenteditable="true">Editable title</div><div id="editor"'));
  await scroll(page, 440);
  assert.equal(await pinned(page), '');
  await page.close();
});

test('responds to viewport resizing without horizontal overflow', async () => {
  const page = await open();
  await scroll(page, 440);
  await page.setViewportSize({ width: 700, height: 800 });
  await page.waitForTimeout(100);
  const box = await page.locator('#toolbar').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 700);
  const placeholder = await page.locator('[data-lft-placeholder]').boundingBox();
  assert.ok(Math.abs(placeholder.height - box.height) < 1);
  assert.equal(await pinned(page), '');
  await page.close();
});

test('handles nested scroll containers', async () => {
  const html = fixture.replace('<main id="draft">', '<section id="scrollbox" style="height:600px; overflow-y:auto; margin-top:90px"><main id="draft">')
    .replace('</main>', '</main></section>');
  const page = await open(html);
  await page.locator('#scrollbox').evaluate(node => { node.scrollTop = 400; });
  await page.waitForTimeout(100);
  assert.equal(await pinned(page), '');
  assert.equal((await page.locator('#toolbar').boundingBox()).y, 90);
  await page.close();
});

test('detects an editor added by SPA navigation and cleans up removed editors', async () => {
  const page = await open('<body><div id="app">Feed</div></body>');
  assert.equal((await page.evaluate(() => window.sendExtensionMessage('lft:status'))).found, false);
  await page.locator('#app').evaluate((node, html) => { node.outerHTML = html; }, fixture.match(/<main[\s\S]*<\/main>/)[0]);
  await page.waitForTimeout(100);
  assert.equal((await page.evaluate(() => window.sendExtensionMessage('lft:status'))).found, true);
  await scroll(page, 440);
  await page.locator('#draft').evaluate(node => node.remove());
  await page.waitForTimeout(100);
  assert.equal((await page.evaluate(() => window.sendExtensionMessage('lft:status'))).found, false);
  assert.equal(await page.locator('[data-lft-placeholder]').count(), 0);
  await page.close();
});

test('does not attach to a navigation bar or a page without a draft', async () => {
  const page = await open(fixture.replace('contenteditable="true"', 'contenteditable="false"'));
  await scroll(page, 440);
  assert.equal(await pinned(page), null);
  await page.close();
});

test('fallback recognizes labeled controls without known class names', async () => {
  const page = await open(fixture.replace('role="toolbar"', '').replace('class="toolbar"', 'class="new-controls"'));
  await scroll(page, 440);
  assert.equal(await pinned(page), '');
  await page.close();
});

test('manual picker supports unfamiliar labels and suppresses the picker click', async () => {
  const html = fixture.replace('role="toolbar"', '').replace(/aria-label="(Bold|Italic|Style|Bullet list|Numbered list|Block quote|Insert link|Insert image)"/g, 'aria-label="Format"');
  const page = await open(html);
  assert.equal((await page.evaluate(() => window.sendExtensionMessage('lft:status'))).found, false);
  await page.evaluate(() => window.sendExtensionMessage('lft:pick'));
  await page.locator('#bold').click();
  assert.equal(await page.evaluate(() => window.boldClicks || 0), 0);
  await scroll(page, 440);
  assert.equal(await pinned(page), '');
  await page.close();
});

test('Escape cancels the manual picker', async () => {
  const page = await open();
  await page.evaluate(() => window.sendExtensionMessage('lft:pick'));
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-lft-picking]').count(), 0);
  await page.close();
});

test('popup loads settings, changes them, and reports unavailable tabs', async () => {
  const page = await browser.newPage();
  await page.setContent(fs.readFileSync(path.join(root, 'extension/popup.html'), 'utf8').replace('<script src="popup.js"></script>', ''));
  await page.evaluate(() => {
    window.saved = {};
    window.chrome = {
      storage: { local: { get: async () => ({ enabled: true, offset: 24 }), set: async value => { window.saved = value; } } },
      tabs: { query: async () => [{ id: 1 }], sendMessage: async () => ({ enabled: true, found: true }) }
    };
  });
  await page.addScriptTag({ path: path.join(root, 'extension/popup.js') });
  await page.waitForTimeout(80);
  assert.equal(await page.locator('#offset').inputValue(), '24');
  assert.match(await page.locator('#status').textContent(), /Toolbar detected/);
  await page.locator('#enabled').uncheck();
  assert.equal(await page.evaluate(() => window.saved.enabled), false);
  await page.evaluate(() => { chrome.tabs.sendMessage = async () => { throw new Error('No receiver'); }; });
  await page.locator('#enabled').check();
  await page.waitForTimeout(50);
  assert.match(await page.locator('#status').textContent(), /refresh/);
  assert.equal(await page.locator('#pick').isDisabled(), true);
  await page.close();
});

test('manifest limits injection to LinkedIn and declares only storage permission', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://www.linkedin.com/*']);
  for (const file of [...manifest.content_scripts[0].js, ...manifest.content_scripts[0].css, manifest.action.default_popup]) {
    assert.ok(fs.existsSync(path.join(root, 'extension', file)));
  }
});
