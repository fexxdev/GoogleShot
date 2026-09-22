# GoogleShot

A toolbox for Google Workspace, in the browser and on the command line.

**Docs and Slides → PDF.** Capture every page of a Google Doc or every slide of a Google Slides deck as JPEG images, then build one compact PDF. The capture renders the real editor, so animations and final states are kept.

**Gmail → archive.** Right-click a thread and download it as a complete archive: `.mbox`, `.pdf`, `.txt`, `.json`, `.xml`, `.csv` or `.html`, with the attachments inside. No Takeout, no labels, no waiting.

Everything runs on your machine. No server, no analytics, no uploads.

## Extension (Chrome, Brave, Edge)

### Install

**From the store**: (link coming soon)

**From source**:

```sh
npm install
npm run build
```

Then open `chrome://extensions` (or `brave://extensions`), enable **Developer mode**, click **Load unpacked** and select the `extension/` folder.

### Use — Docs and Slides

1. Open a document or a presentation.
2. Click the GoogleShot icon and **Capture this tab**, or right-click anywhere and pick **Capture this as PDF**.
3. The PDF and the JPEG images land in your downloads.

Options: page range (`1-5,8`), capture speed, file name, JPEG quality, save the images. Every operation can be cancelled: from the popup, or from the **Cancel** button on the page panel.

### Use — Gmail

1. Open a thread.
2. Right-click anywhere and pick a format under **Download this thread**, or use the popup.
3. You get the whole thread, attachments included.

Formats: `.mbox` (full RFC822 archive), `.pdf`, `.txt`, `.json`, `.xml`, `.csv`, `.html`. Extra options: attachments only (zip), last N messages. Select several threads in the list and use **Export selected threads** to get them in one zip.

### Options

The gear icon in the popup opens the options page: defaults, debug mode and the export history.

## CLI (Node.js 20+)

```sh
npm install
npm link
```

One time, start your browser with remote debugging:

```sh
googleshot browser
```

Then capture:

```sh
gshot c "https://docs.google.com/document/d/<id>/edit"
gshot c "https://docs.google.com/presentation/d/<id>/edit"
gshot c <id> --doc    # a bare ID is assumed to be a presentation, unless --doc
gshot l        # check the Google session
gshot b        # start the debug browser
```

`gshot` is a short alias of `googleshot`. Commands: `c` = capture, `l` = login, `b` = browser.

The CLI reads the cookies from the debug browser, uses them in memory and never writes a cookie file.

Captured images go to `<title>_pages` (Docs) or `<title>_slides` (Slides): previous `page-NNN.jpg` / `slide-NNN.jpg` files are overwritten, anything else in the folder is kept.

## Privacy

GoogleShot has no backend. It reads the page you ask for, builds the file locally and saves it in your downloads. Nothing leaves your machine. The full text: [PRIVACY.md](PRIVACY.md).

## Development

```sh
npm test            # unit tests
npm run check:compose  # Docs compose check on a mock page (real Chrome)
npm run build       # build the extension into extension/
npm run shots       # regenerate the store screenshots
npm run release     # bump the patch version, then build
```

Layout:

- `src/` — CLI code (Node, Playwright)
- `extension/src/` — extension code (service worker, content scripts, page script, PDF and mbox builders)
- `extension/static/` — manifest, popup, options, locales
- `shared/` — geometry helpers used by both
- `test/` — unit tests

Every `npm run release` bumps the extension version, so you always know which build is loaded. Plain `npm run build` never touches the version.

## License

MIT — see [LICENSE](LICENSE).
