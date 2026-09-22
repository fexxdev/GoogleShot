# Changelog

All notable changes to GoogleShot are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.13] — 2026-09-22

First release.

### Extension (Chrome 116+, Brave, Edge)

- Capture every page of a Google Doc or every slide of a Google Slides deck as JPEG images, then build one PDF. The capture renders the real editor and composes the pages from the real bitmap pixels, so final states and long documents stay correct.
- Page ranges (`1-5,8`), capture speed, file name, JPEG quality, and an option to keep the images only.
- Capture the current tab from the popup, or right-click on the page and pick **Capture this as PDF**.
- Export a Gmail thread as `.mbox` (full RFC822 archive), `.pdf`, `.txt`, `.json`, `.xml`, `.csv` or `.html`, with the attachments inside.
- Attachments only (zip) or last N messages, and several selected threads in one zip.
- Cancel any running operation: from the popup, or from the **Cancel** button on the page panel.
- Options page with defaults, debug mode, and the local export history (last 50 entries).
- English and Italian interface.

### CLI (Node.js 20+)

- `googleshot` and `gshot` commands: `c` (capture), `l` (login check), `b` (debug browser).
- Attach to your own browser over CDP instead of an isolated profile. The Google session cookies are used in memory and are never written to disk.
- Images go to `<title>_pages` (Docs) or `<title>_slides` (Slides). Previous `page-NNN.jpg` / `slide-NNN.jpg` files are overwritten; anything else in the folder is kept.

### Privacy

- No backend, no analytics, no uploads. Every file is built on your machine and saved to your downloads.

[0.3.13]: https://github.com/fexxdev/GoogleShot/releases/tag/v0.3.13
