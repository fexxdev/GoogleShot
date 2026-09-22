# GoogleShot

Capture every slide of a Google Slides presentation as PNG images. Build one PDF from the images.

GoogleShot uses your browser session. It reads the Google cookies from your browser, then captures the slides in a headless Chrome. Your browser stays untouched.

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

GoogleShot reads the cookies over the Chrome DevTools Protocol, then captures every slide in a headless browser.

3. Output:

```
<deck title>.pdf
<deck title>_slides/slide-001.png
```

After the first capture, GoogleShot saves the cookies in `~/.googleshot/cookies.json`. Next captures work also when the browser is closed. The saved cookies expire when the Google session expires. Refresh them with a capture while the debug browser is open.

## Commands

- `googleshot capture <url|id>` — read the session, capture every slide, write the PDF and the PNG files.
- `googleshot login` — check that your browser has a Google session.
- `googleshot browser` — start your browser with remote debugging.

## Options

- `-o, --output <file.pdf>` — PDF path. Default: `<deck title>.pdf`.
- `--png-dir <dir>` — PNG folder. Default: `<deck title>_slides`.
- `--browser <name>` — `brave`, `chrome`, `msedge` or `chromium`. If omitted, the tool asks.
- `--restart` — restart the browser automatically when it is already open.

## Notes

- The capture uses the editor view. Every slide shows its final state, including animations.
- The PDF keeps the slide aspect ratio. The width is 960 pt.
- Slide images are 1924x1084 pixels (2x scale).

## Security

`~/.googleshot/cookies.json` contains your Google session cookies. Keep this file private. GoogleShot writes it with mode 600.
