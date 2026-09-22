# GoogleShot

Capture every slide of a Google Slides presentation or every page of a Google Doc as JPEG images. Build one compact PDF from the images.

Two versions:

- **Browser extension** (Chrome / Brave): works in your open tab, no setup.
- **CLI**: uses your browser session and a headless Chrome.

## Extension

### Install

1. Build the extension:

```sh
npm install
npm run build
```

2. Open `chrome://extensions` (or `brave://extensions`).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `extension/` folder.

### Use — Docs and Slides

1. Open a Google Doc or a Google Slides deck.
2. Click the GoogleShot icon and then **Capture this tab**.
3. The popup closes, the page shows a small progress panel, and the PDF downloads with the document name.

On any other page the popup shows "Doesn't work here" and the capture button stays disabled. The extension follows the browser language (English and Italian).

### Use — Gmail threads

1. Open a Gmail thread.
2. Right-click anywhere in the page and choose **Download this thread as .mbox**, or click the GoogleShot icon and **Export this thread**.
3. GoogleShot downloads an `.mbox` file with every message of the thread and the attachments.

The export uses the Gmail session of the tab. It reads the thread and the attachments over HTTPS with your cookies, and it never sends anything to third parties. Files are saved by Chrome, like any other download.

**Advanced options**:

- **Pages / slides** — capture a subset. Examples: `1-5`, `2,4,7`, `3-`.
- **Capture speed** — `Fast`, `Normal` or `Safe (slower)` for slow machines.
- **File name** — override the PDF name. Default: the document title.
- **JPEG quality** — image compression, like `--quality` on the CLI.
- **Also save the JPEG images** — write the images next to the PDF.

The capture uses the Chrome debugger API. Chrome shows a small "being debugged" banner while the capture runs. The extension never reads your cookies and never uploads anything.

## CLI

### Requirements

- Node.js 20 or newer
- One Chromium-based browser with your Google session: Brave, Google Chrome, Microsoft Edge or Playwright Chromium

### Install

```sh
npm install
npm link
```

### Quick start

1. Start your browser with remote debugging (one time):

```sh
googleshot browser
```

If the browser is already open, the command asks to restart it. Open tabs can be lost. `--restart` skips the question.

2. Capture a deck:

```sh
googleshot capture "https://docs.google.com/presentation/d/<id>/edit"
```

or a document:

```sh
googleshot capture "https://docs.google.com/document/d/<id>/edit"
```

Always put the URL in quotes. The `?` of query parameters is a glob character in zsh.

GoogleShot reads the cookies over the Chrome DevTools Protocol, then captures every slide or page in a headless browser.

3. Output for a deck:

```
<deck title>.pdf
<deck title>_slides/slide-001.jpg
```

Output for a document:

```
<doc title>.pdf
<doc title>_pages/page-001.jpg
```

GoogleShot reads the cookies straight from the debug browser, uses them in memory and never writes them to disk. Keep the debug browser open for every capture.

## Commands

- `googleshot capture <url|id>` — read the session, capture every slide of a presentation or every page of a document, write the PDF and the JPEG files.
- `googleshot login` — check that your browser has a Google session.
- `googleshot browser` — start your browser with remote debugging.

`gshot` is a short alias of `googleshot`. These shorthands work: `c` for `capture`, `l` for `login`, `b` for `browser`.

```sh
gshot c "https://docs.google.com/document/d/<id>/edit"
gshot l
gshot b
```

## Options

- `-o, --output <file.pdf>` — PDF path. Default: `<title>.pdf`.
- `--images-dir <dir>` — Image folder. Default: `<title>_slides` for Slides, `<title>_pages` for Docs.
- `--quality <1-100>` — JPEG quality of the images. Default: 90.
- `--browser <name>` — `brave`, `chrome`, `msedge` or `chromium`. If omitted, the tool asks.
- `--restart` — restart the browser automatically when it is already open.

## Development

```sh
npm test    # unit tests
npm run build   # build the extension from extension/src into extension/
```

Layout:

- `src/` — CLI code (Node, Playwright)
- `extension/src/` — extension code (service worker, content script, page script)
- `extension/static/` — manifest and popup sources
- `shared/doc.js` — page geometry helpers used by both versions
- `test/` — unit tests

The built extension files in `extension/*.js` and `extension/*.html` are generated. Edit the sources.

## Notes

- Both versions use the editor view. The PDF keeps the aspect ratio of the source. The width is 960 pt.
- Every slide shows its final state, including animations.
- Every document page keeps its full height, also when the page is taller than the viewport.
- Use a lower `--quality` for smaller files. Quality 80 is about 20% smaller.

## Environment

- `GOOGLESHOT_COLOR_SCHEME` — `dark` or `light`. The captures follow the system theme. Set this to override the detection.
- `GOOGLESHOT_HOME` — folder for the cookies and the config. Default: `~/.googleshot`.
- `GOOGLESHOT_LANG` — `en` or `it`. The CLI follows the system language. Set this to override the detection.

## Security

- The CLI keeps the cookies in memory only. It never writes a cookie file.
- The extension never reads the cookies. It works inside the open tab with the session of the tab.
