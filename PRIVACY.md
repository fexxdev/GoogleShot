# Privacy policy

GoogleShot works on your machine. It has no server and no analytics.

## What GoogleShot reads

- On a Google Docs or Google Slides tab, when you start a capture: the page of the document you have open. The extension renders it and builds the PDF and the images locally.
- On a Gmail tab, when you start an export: the thread you have open and its attachments.
- The CLI reads the Google cookies from your browser over the Chrome DevTools Protocol. The cookies stay in memory and are never written to a file.

## What GoogleShot sends

Nothing. There is no backend, no telemetry, no third-party service. The extension talks only to Google, from your browser, on your behalf.

## What GoogleShot stores on your disk

- The files you ask for: the PDF, the images and the `.mbox` exports. They go to your normal download folder.
- The extension settings and the export history (the last 50 entries) in the local Chrome storage of the extension.
- The CLI settings in `~/.googleshot/config.json`. The CLI writes no cookie file.

## What GoogleShot never does

- It never reads your cookies from the extension. The extension works inside the open tab with the session of the tab.
- It never uploads your documents, your emails or your attachments anywhere.
- It never sells or shares data, because it has none.

## Permissions

- `debugger` — capture the page pixels in the browser, for the PDF.
- `downloads` — save the PDF, the images and the archives.
- `storage` — the settings and the local export history.
- `scripting`, `activeTab` — run the capture script in the tab you choose.
- `contextMenus` — add the Gmail right-click entry.
- Host permissions (`docs.google.com`, `mail.google.com`, `mail-attachment.googleusercontent.com`) — read the page and download the attachments of the thread you export.

## Contact

fexxdev@gmail.com
