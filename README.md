# LinkedIn Floating Toolbar

Keep the article and newsletter formatting toolbar within reach while writing long drafts on LinkedIn.

A small Chrome Manifest V3 extension by Bhupessh Yadav. It pins the original formatting toolbar below the page header when you scroll past it, preserves its original buttons and event handlers, and returns it to its original position when you scroll back up or leave the editor.

## Install in Chrome

1. On [this repository](https://github.com/BhuYadav/linkedin_floating_toolbar), click **Code → Download ZIP**, then extract the ZIP.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** in the upper-right corner.
4. Click **Load unpacked** and select the `extension` folder inside the extracted repository. It contains `manifest.json`.
5. Refresh LinkedIn, open an article or newsletter draft, and scroll down.
6. Pin this extension through Chrome's puzzle-piece menu for easy access to its settings.

If using the separately packaged `linkedin-floating-toolbar-extension.zip`, select its extracted folder containing `manifest.json` instead.

Keep the extracted folder in a permanent location. Chrome loads the extension from that folder. After updating the code, click **Reload** on the extension card and refresh LinkedIn.

## Settings

Click the extension icon to turn floating on or off, add up to 160 px of extra space below the page header, or choose a missed toolbar manually. For manual selection, click a formatting control in the toolbar. That first click selects the toolbar; it does not apply formatting. Press **Esc** to cancel.

The manual choice lasts for the current editor/page session. Only the enabled setting and extra spacing are stored between sessions.

## Scope and privacy

- Intended for article/newsletter drafts, including the formatting toolbar shown in LinkedIn's long-form editor. Regular feed posts, comments, and messages are not the target.
- Runs only on `https://www.linkedin.com/`. Matching the whole host supports editors opened through LinkedIn's in-page navigation.
- Requires only the `storage` API permission. Chrome will also request access to the matching LinkedIn site so the extension can change the toolbar's layout.
- Reads element geometry, markup, and formatting-control labels to locate the toolbar. It does not read, save, or transmit article body text.
- Stores two local settings. No telemetry, analytics, remote code, account credentials, external requests, publishing automation, or backend.
- Independent project; not affiliated with or endorsed by LinkedIn.

## Validation and limitations

The automated browser tests use a synthetic article editor with mocked Chrome messaging/storage APIs. They check pinning, unchanged editor layout, original Bold-handler behavior with a text selection, spacing settings, restoration of inline styles, stopping at the end of an article, resizing, nested scrolling, dynamic editor insertion/removal, manual selection, popup behavior, and the manifest's permissions.

All 14 tests passed in headless Chromium on October 12, 2026. JavaScript syntax checks also passed.

These fixtures are not LinkedIn's live DOM. A screenshot cannot establish its markup or runtime behavior. Live LinkedIn compatibility still needs a check on your own draft. LinkedIn may change its markup; automatic detection uses common editor selectors and control-label fallbacks, with manual selection as a backup. Automatic English-label detection may require the manual fallback for other interface languages.

Known limitations: editors inside iframes or shadow roots are not supported; transformed ancestors and unusual clipping containers can affect fixed positioning; only one editor is tracked at a time. Popup menus remain owned by LinkedIn, so check dropdown alignment on your own draft. Turn the extension off if a site layout is incompatible.

### First live check

Use a test draft. Scroll into the article; confirm the toolbar is visible and not covering the header. Select text and test Bold, Italic, lists, Style, links, and image controls. Check dropdown positioning and editor focus, then scroll back up. Switch the extension off and confirm the original layout returns. Also test browser zoom and a narrow window.

## Development

Requires Node.js 22+ and Python 3 for packaging. There is no runtime dependency and no build step.

```sh
npm ci
npx playwright install chromium
npm run check
npm test
npm run package
```

`tests/editor.html` is a local test fixture. It is not a LinkedIn screenshot. The browser suite injects the exact extension JS and CSS into it. GitHub Actions runs the same checks on pushes and pull requests.

## Get the source

```sh
git clone https://github.com/BhuYadav/linkedin_floating_toolbar.git
cd linkedin_floating_toolbar
```

Chrome installation uses the `extension/` folder; uploading code to GitHub does not install the extension or publish it in the Chrome Web Store.

## Contributing

For a detection issue, report Chrome version, UI language, article/newsletter mode, and whether manual selection worked. Include only redacted toolbar markup or a cropped toolbar screenshot; do not upload your private draft or account details.

Licensed under the [MIT License](LICENSE).

## References

- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Load an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)
- [Chrome local storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
