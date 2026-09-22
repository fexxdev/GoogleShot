const elements = {
  navDefaults: document.getElementById('navDefaults'),
  navGmail: document.getElementById('navGmail'),
  navHistory: document.getElementById('navHistory'),
  gmailTitle: document.getElementById('gmailTitle'),
  gmailDesc: document.getElementById('gmailDesc'),
  gmailFormat: document.getElementById('gmailFormat'),
  gmailFormatLabel: document.getElementById('gmailFormatLabel'),
  gmailLimit: document.getElementById('gmailLimit'),
  gmailLimitLabel: document.getElementById('gmailLimitLabel'),
  gmailAttachmentsOnly: document.getElementById('gmailAttachmentsOnly'),
  gmailAttachmentsLabel: document.getElementById('gmailAttachmentsLabel'),
  versionLine: document.getElementById('versionLine'),
  defaultsTitle: document.getElementById('defaultsTitle'),
  defaultsDesc: document.getElementById('defaultsDesc'),
  defaultToolLabel: document.getElementById('defaultToolLabel'),
  site: document.getElementById('site'),
  siteAuto: document.getElementById('siteAuto'),
  siteDocs: document.getElementById('siteDocs'),
  siteGmail: document.getElementById('siteGmail'),
  quality: document.getElementById('quality'),
  qualityLabel: document.getElementById('qualityLabel'),
  speed: document.getElementById('speed'),
  speedLabel: document.getElementById('speedLabel'),
  speedFast: document.getElementById('speedFast'),
  speedNormal: document.getElementById('speedNormal'),
  speedSafe: document.getElementById('speedSafe'),
  imageFolder: document.getElementById('imageFolder'),
  imagesLabel: document.getElementById('imagesLabel'),
  debug: document.getElementById('debug'),
  debugLabel: document.getElementById('debugLabel'),
  historyTitle: document.getElementById('historyTitle'),
  historyDesc: document.getElementById('historyDesc'),
  historyContainer: document.getElementById('historyContainer'),
  clearHistory: document.getElementById('clearHistory'),
};

const FALLBACK = {
  optionsDefaultsTitle: 'Defaults',
  optionsDefaultsDesc: 'The popup uses these values for every capture and export.',
  optionsDefaultTool: 'Preferred tool',
  optionsToolAuto: 'Detect the site automatically',
  optionsToolDocs: 'Docs and Slides',
  optionsToolGmail: 'Gmail',
  optionsHistoryTitle: 'Export history',
  optionsHistoryDesc: 'The last 50 captures and exports.',
  optionsHistoryEmpty: 'No exports yet.',
  optionsNavDefaults: 'Defaults',
  optionsNavGmail: 'Gmail',
  optionsNavHistory: 'History',
  optionsGmailTitle: 'Gmail defaults',
  optionsGmailDesc: 'The popup and the right-click export use these Gmail values.',
  popupGmailFormat: 'Format',
  popupGmailLimit: 'Last messages',
  popupGmailLimitPlaceholder: 'All',
  popupGmailAttachments: 'Only the attachments (zip)',
  optionsClearHistory: 'Clear history',
  optionsSaveFailed: 'Could not save the settings.',
  colWhen: 'When',
  colTool: 'Tool',
  colTitle: 'Title',
  colFormat: 'Format',
  colItems: 'Items',
  toolCapture: 'Docs / Slides',
  toolGmail: 'Gmail',
};

const TOOL_LABELS = {
  capture: 'toolCapture',
  gmail: 'toolGmail',
};

let strings = { ...FALLBACK };

function gsLog(step, data) {
  try {
    chrome.runtime.sendMessage({ target: 'googleshot', method: 'logs', popup: { step, data } });
  } catch {
    // ignore
  }
  chrome.storage.local.get({ debug: false }).then((values) => {
    if (values.debug) {
      console.log('[GS] options:' + step, data === undefined ? '' : data);
    }
  });
}

async function loadStrings() {
  try {
    const response = await chrome.runtime.sendMessage({ target: 'googleshot', method: 'strings' });
    if (response && response.ok && response.strings) {
      strings = { ...FALLBACK, ...response.strings };
    }
  } catch {
    // fallbacks
  }
}

function applyStrings() {
  elements.navDefaults.textContent = strings.optionsNavDefaults;
  elements.navGmail.textContent = strings.optionsNavGmail;
  elements.navHistory.textContent = strings.optionsNavHistory;
  elements.defaultsTitle.textContent = strings.optionsDefaultsTitle;
  elements.defaultsDesc.textContent = strings.optionsDefaultsDesc;
  elements.defaultToolLabel.textContent = strings.optionsDefaultTool;
  elements.siteAuto.textContent = strings.optionsToolAuto;
  elements.siteDocs.textContent = strings.optionsToolDocs;
  elements.siteGmail.textContent = strings.optionsToolGmail;
  elements.qualityLabel.textContent = strings.popupQuality || 'JPEG quality';
  elements.speedLabel.textContent = strings.popupSpeed || 'Capture speed';
  elements.speedFast.textContent = strings.popupSpeedFast || 'Fast';
  elements.speedNormal.textContent = strings.popupSpeedNormal || 'Normal';
  elements.speedSafe.textContent = strings.popupSpeedSafe || 'Safe (slower)';
  elements.imagesLabel.textContent = strings.popupSaveImages || 'Also save the JPEG images';
  elements.debugLabel.textContent = strings.popupDebug || 'Debug mode (console logs)';
  elements.gmailTitle.textContent = strings.optionsGmailTitle;
  elements.gmailDesc.textContent = strings.optionsGmailDesc;
  elements.gmailFormatLabel.textContent = strings.popupGmailFormat;
  elements.gmailLimitLabel.textContent = strings.popupGmailLimit;
  elements.gmailAttachmentsLabel.textContent = strings.popupGmailAttachments;
  elements.gmailLimit.placeholder = strings.popupGmailLimitPlaceholder;
  elements.historyTitle.textContent = strings.optionsHistoryTitle;
  elements.historyDesc.textContent = strings.optionsHistoryDesc;
  elements.clearHistory.textContent = strings.optionsClearHistory;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function renderHistory(history) {
  if (!history || history.length === 0) {
    elements.historyContainer.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = strings.optionsHistoryEmpty;
    elements.historyContainer.appendChild(empty);
    elements.clearHistory.hidden = true;
    return;
  }
  elements.clearHistory.hidden = false;
  const table = document.createElement('table');
  const head = document.createElement('tr');
  for (const key of ['colWhen', 'colTool', 'colTitle', 'colFormat', 'colItems']) {
    const th = document.createElement('th');
    th.textContent = strings[key] || key;
    head.appendChild(th);
  }
  table.appendChild(head);
  for (const entry of history.slice(0, 50)) {
    const row = document.createElement('tr');
    const cells = [
      formatDate(entry.at),
      strings[TOOL_LABELS[entry.action] || 'toolCapture'],
      entry.title || '',
      entry.format || '',
      String(entry.count === undefined ? '' : entry.count),
    ];
    for (const value of cells) {
      const td = document.createElement('td');
      td.textContent = value;
      row.appendChild(td);
    }
    table.appendChild(row);
  }
  elements.historyContainer.innerHTML = '';
  elements.historyContainer.appendChild(table);
}

function watchSections() {
  const links = Array.from(document.querySelectorAll('.sidebar a[data-section]'));
  const sections = links
    .map((link) => document.getElementById(link.getAttribute('data-section')))
    .filter(Boolean);
  const setActive = (id) => {
    for (const link of links) {
      link.classList.toggle('active', link.getAttribute('data-section') === id);
    }
  };
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length) {
          setActive(visible[0].target.id);
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: [0.1, 0.5] }
    );
    for (const section of sections) {
      observer.observe(section);
    }
  } else {
    setActive(sections[0] ? sections[0].id : 'defaults');
  }
  for (const link of links) {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const target = document.getElementById(link.getAttribute('data-section'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActive(target.id);
      }
    });
  }
}

let saveTimer = null;

function flashSaved() {
  const line = document.getElementById('savedLine') || document.createElement('span');
  line.id = 'savedLine';
  line.className = 'saved visible';
  line.textContent = '✓';
  elements.versionLine.appendChild(line);
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => line.classList.remove('visible'), 1200);
}

async function save(values) {
  await chrome.storage.local.set(values);
  flashSaved();
}

async function refresh() {
  const version = chrome.runtime.getManifest().version;
  elements.versionLine.textContent = `v${version}`;
  await loadStrings();
  applyStrings();

  const values = await chrome.storage.local.get({
    quality: 90,
    speed: 'normal',
    imageFolder: false,
    debug: false,
    preferredTool: 'auto',
    gmailFormat: 'mbox',
    gmailLimit: '',
    gmailAttachmentsOnly: false,
    history: [],
  });
  elements.quality.value = String(values.quality);
  elements.speed.value = values.speed;
  elements.imageFolder.checked = Boolean(values.imageFolder);
  elements.debug.checked = Boolean(values.debug);
  elements.site.value = values.preferredTool;
  elements.gmailFormat.value = values.gmailFormat || 'mbox';
  elements.gmailLimit.value = values.gmailLimit || '';
  elements.gmailAttachmentsOnly.checked = Boolean(values.gmailAttachmentsOnly);
  renderHistory(values.history);
  watchSections();
  gsLog('refresh', { version, history: values.history.length });
}

elements.quality.addEventListener('change', () => save({ quality: Number(elements.quality.value) }));
elements.speed.addEventListener('change', () => save({ speed: elements.speed.value }));
elements.imageFolder.addEventListener('change', () => save({ imageFolder: elements.imageFolder.checked }));
elements.debug.addEventListener('change', () => save({ debug: elements.debug.checked }));
elements.site.addEventListener('change', () => save({ preferredTool: elements.site.value }));
elements.gmailFormat.addEventListener('change', () =>
  save({ gmailFormat: elements.gmailFormat.value, format: elements.gmailFormat.value })
);
elements.gmailLimit.addEventListener('change', () =>
  save({ gmailLimit: elements.gmailLimit.value.trim(), limit: elements.gmailLimit.value.trim() })
);
elements.gmailAttachmentsOnly.addEventListener('change', () =>
  save({
    gmailAttachmentsOnly: elements.gmailAttachmentsOnly.checked,
    attachmentsOnly: elements.gmailAttachmentsOnly.checked,
  })
);
elements.clearHistory.addEventListener('click', async () => {
  await chrome.storage.local.set({ history: [] });
  renderHistory([]);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.history) {
    renderHistory(changes.history.newValue || []);
  }
});

refresh();
