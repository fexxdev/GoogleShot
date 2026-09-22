# GoogleShot

Capture every slide of a Google Slides presentation or every page of a Google Doc as JPEG images. Build one compact PDF from the images.

GoogleShot uses your browser session. It reads the Google cookies from your browser, then captures the slides or pages in a headless Chrome. Your browser stays untouched.

## Requirements

- Node.js 20 or newer
- One Chromium-based browser with your Google session: Brave, Google Chrome, Microsoft Edge or Playwright Chromium

## Install

```sh
npm install
npm link
```

## Quick start

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

After the first capture, GoogleShot saves the cookies in `~/.googleshot/cookies.json`. Next captures work also when the browser is closed. The saved cookies expire when the Google session expires. Refresh them with a capture while the debug browser is open.

## Commands

- `googleshot capture <url|id>` — read the session, capture every slide of a presentation or every page of a document, write the PDF and the JPEG files.
- `googleshot login` — check that your browser has a Google session.
- `googleshot browser` — start your browser with remote debugging.

## Options

- `-o, --output <file.pdf>` — PDF path. Default: `<title>.pdf`.
- `--images-dir <dir>` — Image folder. Default: `<title>_slides` for Slides, `<title>_pages` for Docs.
- `--quality <1-100>` — JPEG quality of the images. Default: 90.
- `--browser <name>` — `brave`, `chrome`, `msedge` or `chromium`. If omitted, the tool asks.
- `--restart` — restart the browser automatically when it is already open.

## Notes

- The Slides capture uses the editor view. Every slide shows its final state, including animations.
- The Docs capture uses the editor view and captures one image per page.
- The PDF keeps the aspect ratio of the source. The width is 960 pt.
- Slide images are about 1443x813 pixels (1.5x scale). A 318 slide deck is about 55 MB.
- Use a lower `--quality` for smaller files. Quality 80 is about 20% smaller.

## Security

`~/.googleshot/cookies.json` contains your Google session cookies. Keep this file private. GoogleShot writes it with mode 600.
