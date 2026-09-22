# Chrome Web Store listing

## Short description (132 characters max)

Capture Docs and Slides as PDF, and download Gmail threads with the attachments. Runs on your machine, no server, no analytics.

## Detailed description

GoogleShot is a local toolbox for Google Workspace.

**Docs and Slides to PDF**

Capture every page of a Google Doc or every slide of a Google Slides deck as JPEG images and build one compact PDF. The capture renders the real editor, so the final state of every slide is kept.

- right-click capture, or the popup
- page range (for example `1-5,8`)
- capture speed for slow machines
- custom file name, JPEG quality, optional images folder

**Gmail threads to a complete archive**

Right-click a thread and download it with the attachments inside. No Takeout, no temporary labels, no waiting.

- `.mbox` — the full RFC822 archive, attachments included, ready for any mail client
- `.pdf` — a clean print view of the whole thread
- `.txt`, `.json`, `.xml`, `.csv`, `.html` — for the tools you already use
- attachments only, as a zip
- last N messages
- select several threads and export them together in one zip

**Privacy**

GoogleShot has no backend. It talks only to Google, from your browser, on your behalf, and it saves the files to your download folder. Nothing leaves your machine. No analytics, no accounts, no tracking.

**Permissions, explained**

- `debugger` — needed to capture the page pixels for the PDF
- `downloads` — to save the PDF, the images and the archives
- host access to `docs.google.com`, `mail.google.com` and the attachment host — to read the page you ask for
- `storage` — the settings and the local export history

Full policy: https://github.com/fexxdev/GoogleShot/blob/main/PRIVACY.md

## Category

Productivity

## Language

English, Italian

## Assets

- `screenshots/popup-docs.png` — the popup on a document (1280×800 recommended; resize before upload)
- `screenshots/popup-gmail.png` — the popup on a Gmail thread
- `screenshots/popup-gmail-advanced.png` — the export options
- `screenshots/options.png` — the options page with history

Icon: `extension/icons/icon-128.png`

## Privacy practices (store form)

- Does the extension collect user data? **No.**
- Does it use remote code? **No.**
- Does it use the data for advertising? **No.**
- Single purpose: capture Google Docs and Slides to PDF, and download Gmail threads with the attachments.
