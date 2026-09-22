# GoogleShot

Capture every slide of a Google Slides presentation as a PNG image. Then build one PDF from the images.

## Requirements

- Node.js 20 or newer
- One Chromium-based browser: Brave, Google Chrome, Microsoft Edge, or Playwright Chromium

## Install

```sh
npm install
npm link
```

## Login (one time)

```sh
googleshot login
```

The tool lists the installed browsers and asks which one to open. The last choice is the default. Add `--browser brave` to skip the question.

The browser window opens on the Google login page. Sign in. The tool saves the session in `~/.googleshot/profiles/<browser>` and closes the window when the login completes. Use this session for private decks.

## Capture

```sh
googleshot capture "https://docs.google.com/presentation/d/<id>/edit" -o deck.pdf
```

Output:

- `<deck title>.pdf` — one PDF page for each slide.
- `<deck title>_slides/slide-001.png` — the PNG image of each slide.

Options:

- `-o, --output <file.pdf>` — PDF path.
- `--png-dir <dir>` — PNG folder.
- `--browser <name>` — `brave`, `chrome`, `msedge` or `chromium`.
- `--headful` — show the browser window. Use this option to debug.

## How it works

1. Opens the presentation in the selected browser with your saved session.
2. Reads the slide list from the editor filmstrip.
3. Exports each slide as PNG with the Google export endpoint.
4. Builds the PDF.
