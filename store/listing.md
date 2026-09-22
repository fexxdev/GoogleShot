# Chrome Web Store listing

## Short description (132 characters max)

Capture Docs and Slides as PDF, and download Gmail threads with the attachments. Runs on your machine, no server, no analytics.

## Detailed description (English)

GoogleShot is a local toolbox for Google Workspace. It saves what you already see in your browser.

Documents and Presentations: capture every page or every slide as one PDF, or pick a range like 1-5,8. You can also keep the JPEG images of every page.

Gmail: download an open conversation as an archive with the attachments inside. Pick the format when you export, from a complete mailbox file to a plain text copy. You can also export only the attachments, the last N messages, or several selected conversations at once.

Everything happens on your machine: no server, no account, no tracking. The files go straight to your download folder. Available in English and Italian.

## Detailed description (Italian)

GoogleShot è una cassetta degli attrezzi locale per Google Workspace. Salva quello che stai già vedendo nel browser.

Documenti e Presentazioni: cattura ogni pagina o ogni slide in un unico PDF, oppure scegli un intervallo come 1-5,8. Puoi anche conservare le immagini JPEG di ogni pagina.

Gmail: scarica una conversazione aperta come archivio con gli allegati dentro. Scegli il formato al momento dell'esportazione, dall'archivio completo alla copia in testo semplice. Puoi anche esportare solo gli allegati, gli ultimi N messaggi o più conversazioni selezionate insieme.

Tutto avviene sul tuo computer: nessun server, nessun account, nessun tracciamento. I file finiscono direttamente nella cartella dei download. Disponibile in italiano e inglese.

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
