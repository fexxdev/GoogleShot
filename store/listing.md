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

Full policy: https://fexx.dev/googleshot/privacy

## Category

Productivity

## Language

English, Italian

## Assets (in `store/upload/`, ready to upload)

- `popup-docs-1280x800.png` — the popup on a document
- `popup-gmail-1280x800.png` — the popup on a Gmail thread
- `popup-gmail-advanced-1280x800.png` — the export options
- `options-1280x800.png` — the options page with history
- `promo-small-440x280.png` — the small promo tile (required)

Source screenshots live in `store/screenshots/`. Regenerate with `npm run promo` (tile) and the PIL padding step; originals are kept untouched.

Icon: `extension/icons/icon-128.png`

## Privacy practices (store form — copy these answers)

- Does the extension collect user data? **Yes: email message content and document content, strictly on-device.**
  - Data types: "Email messages" (Gmail thread export) and "Website content" (Docs/Slides capture).
  - Purpose: "App functionality" only.
  - Transmitted off the device? **No.** Everything is processed locally and saved to the download folder.
  - Sold, shared or used for advertising? **No.**
  - Authentication data, financial data, health data? **No.**
- Privacy policy URL (required): https://fexx.dev/googleshot/privacy
- Does it use remote code? **No** (all code is bundled; no CDN, no eval).
- Single purpose: capture Google Docs and Slides to PDF, and download Gmail threads with the attachments.
- Permission justifications (also in the detailed description):
  - `debugger` — captures the page pixels for the PDF; Chrome shows its standard debugging banner while capturing.
  - `downloads` — saves the PDF, images and archives.
  - `scripting` + `activeTab` — runs the capture only in the tab you choose.
  - `storage` — settings and the local export history (last 50, on-device).
  - `contextMenus` — the right-click entries.
  - Host access to `docs.google.com`, `mail.google.com`, `mail-attachment.googleusercontent.com` — reads only the page/thread you export.

Note: `debugger` + Gmail host access usually trigger a manual review (days to a few weeks). Do not re-upload while waiting unless asked.
