const MESSAGES = {
  en: {
    missingPresentation: 'Missing presentation URL or ID.',
    missingDocument: 'Missing document URL or ID.',
    cannotFindPresentationId: 'Cannot find a presentation ID in: $1',
    cannotFindDocumentId: 'Cannot find a document ID in: $1',
    unknownCommand: 'Unknown command: $1',
    sessionCookies: 'Session: $1 cookies from $2 (memory only).',
    noGoogleSession: 'No Google session in $1. Sign in at https://accounts.google.com first.',
    loginRequired: 'Google login required in the selected browser.',
    noSlides: 'No slides found.',
    noPages: 'No pages found.',
    cannotFindPage: 'Cannot find page $1 in the document.',
    cannotCapturePage: 'Cannot capture page $1.',
    cannotFindEditor: 'Cannot find the document editor.',
    cannotFindFilmstrip: 'Cannot find the slide filmstrip.',
    documentLabel: 'Document: $1',
    presentationLabel: 'Presentation: $1',
    pageCaptured: 'Page $1 of $2 captured',
    slideCaptured: 'Slide $1 captured',
    pagesCount: '$1 pages',
    slidesCount: '$1 slides',
    done: 'Done. $1.',
    pdfPath: 'PDF: $1',
    imagesPath: 'Images: $1',
    noBrowserFound: 'No supported browser found. Install Brave, Chrome or Edge, then retry.',
    browserRunning: '$1 is running without remote debugging. Quit $1 and retry, or use --restart.',
    browserReady: '$1 is ready with remote debugging on $2.',
    cannotQuit: 'Could not quit $1. Quit it manually, then retry.',
    didNotStart: '$1 did not start with remote debugging.',
    noFreePort: 'No free remote debugging port in $1.',
    loginFound: 'Google session found in $1.',
    loginMissing: 'No Google session in $1. Sign in at https://accounts.google.com, then retry.',
    restartQuestion: '$1 is already open. Restart it in debug mode? Open tabs can be lost. [y/N]: ',
    missingSource: 'Missing presentation or document URL or ID.',
    cannotFindSource: 'Cannot find a presentation or document in: $1',
    invalidQuality: 'Invalid quality: $1. Use a number from 1 to 100.',
    unknownBrowser: 'Unknown browser "$1". Available: $2.',
    browserNotInstalled: '$1 is not installed.',
    cannotOpenPage: 'Cannot open a page in $1.',
  },
  it: {
    missingPresentation: 'URL o ID della presentazione mancante.',
    missingDocument: 'URL o ID del documento mancante.',
    cannotFindPresentationId: 'Impossibile trovare un ID presentazione in: $1',
    cannotFindDocumentId: 'Impossibile trovare un ID documento in: $1',
    unknownCommand: 'Comando sconosciuto: $1',
    sessionCookies: 'Sessione: $1 cookie da $2 (solo in memoria).',
    noGoogleSession: 'Nessuna sessione Google in $1. Accedi su https://accounts.google.com e riprova.',
    loginRequired: 'Serve l\'accesso a Google nel browser selezionato.',
    noSlides: 'Nessuna slide trovata.',
    noPages: 'Nessuna pagina trovata.',
    cannotFindPage: 'Impossibile trovare la pagina $1 nel documento.',
    cannotCapturePage: 'Impossibile catturare la pagina $1.',
    cannotFindEditor: 'Impossibile trovare l\'editor del documento.',
    cannotFindFilmstrip: 'Impossibile trovare la barra delle slide.',
    documentLabel: 'Documento: $1',
    presentationLabel: 'Presentazione: $1',
    pageCaptured: 'Pagina $1 di $2 catturata',
    slideCaptured: 'Slide $1 catturata',
    pagesCount: '$1 pagine',
    slidesCount: '$1 slide',
    done: 'Fatto. $1.',
    pdfPath: 'PDF: $1',
    imagesPath: 'Immagini: $1',
    noBrowserFound: 'Nessun browser supportato. Installa Brave, Chrome o Edge e riprova.',
    browserRunning: '$1 è aperto senza debug remoto. Chiudi $1 e riprova, oppure usa --restart.',
    browserReady: '$1 è pronto con il debug remoto su $2.',
    cannotQuit: 'Impossibile chiudere $1. Chiudilo manualmente e riprova.',
    didNotStart: '$1 non si è avviato con il debug remoto.',
    noFreePort: 'Nessuna porta di debug libera in $1.',
    loginFound: 'Sessione Google trovata in $1.',
    loginMissing: 'Nessuna sessione Google in $1. Accedi su https://accounts.google.com e riprova.',
    restartQuestion: '$1 è già aperto. Riavvio in modalità debug? Le schede aperte possono andare perse. [y/N]: ',
    missingSource: 'URL o ID della presentazione o del documento mancante.',
    cannotFindSource: 'Impossibile trovare una presentazione o un documento in: $1',
    invalidQuality: 'Qualità non valida: $1. Usa un numero da 1 a 100.',
    unknownBrowser: 'Browser sconosciuto "$1". Disponibili: $2.',
    browserNotInstalled: '$1 non è installato.',
    cannotOpenPage: 'Impossibile aprire una pagina in $1.',
  },
};

function systemLocale() {
  const override = process.env.GOOGLESHOT_LANG;
  if (override === 'en' || override === 'it') {
    return override;
  }
  const raw = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '';
  return /^it/i.test(raw) ? 'it' : 'en';
}

export function locale() {
  return systemLocale();
}

export function t(key, ...substitutions) {
  const catalog = MESSAGES[systemLocale()] || MESSAGES.en;
  const message = catalog[key] || MESSAGES.en[key] || key;
  return message.replace(/\$(\d+)/g, (match, position) => {
    const value = substitutions[Number(position) - 1];
    return value === undefined ? match : String(value);
  });
}
