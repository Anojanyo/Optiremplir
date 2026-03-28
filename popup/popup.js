// OptiRemplir — Popup script

(function () {
  'use strict';

  // ─── Constantes ───────────────────────────────────────────────────────────
  const PATIENT_FIELDS = [
    'civilite', 'nom', 'prenom', 'date_naissance',
    'num_secu', 'code_regime', 'caisse', 'centre',
    'adresse', 'code_postal', 'ville', 'telephone', 'email',
    'nom_prescripteur', 'date_ordonnance',
  ];
  const SETTINGS_KEYS = ['simulate_typing', 'highlight_fields', 'save_data'];

  // ─── État formulaires custom ──────────────────────────────────────────────
  let customTemplates = [];   // [{ id, name, fields: [{ label, value }] }]
  let activeTemplateId = null;

  // ─── Onglets ──────────────────────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // ─── Formatage NIR ────────────────────────────────────────────────────────
  function formatNIR(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, 15);
    const groups = [1, 2, 2, 2, 3, 3, 2];
    let result = '', pos = 0;
    for (let i = 0; i < groups.length && pos < digits.length; i++) {
      if (i > 0 && pos < digits.length) result += ' ';
      result += digits.slice(pos, pos + groups[i]);
      pos += groups[i];
    }
    return result;
  }

  const nirInput = document.getElementById('num_secu');
  nirInput.addEventListener('input', () => {
    const formatted = formatNIR(nirInput.value);
    nirInput.value = formatted;
    const digits = formatted.replace(/\D/g, '');
    if (digits.length >= 3)  document.getElementById('code_regime').value = digits.slice(0, 2);
    if (digits.length >= 8)  document.getElementById('caisse').value = digits.slice(5, 8);
  });

  // ─── Data Object patient ──────────────────────────────────────────────────
  function buildPatientData() {
    const get = id => (document.getElementById(id) || {}).value || '';
    const civilite = get('civilite'), nom = get('nom'), prenom = get('prenom');
    const date_naissance = get('date_naissance'), num_secu = get('num_secu');
    const code_regime = get('code_regime'), caisse = get('caisse'), centre = get('centre');
    const adresse = get('adresse'), code_postal = get('code_postal'), ville = get('ville');
    const telephone = get('telephone'), email = get('email');
    const nom_prescripteur = get('nom_prescripteur'), date_ordonnance = get('date_ordonnance');

    const num_secu_raw  = num_secu.replace(/\D/g, '');
    const num_secu_base = num_secu_raw.slice(0, 13);
    const cle_secu      = num_secu_raw.slice(13, 15);

    const toFR = iso => {
      if (!iso) return '';
      const [y, m, d] = iso.split('-');
      return `${d}/${m}/${y}`;
    };
    const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';

    return {
      civilite, nom, prenom, date_naissance,
      num_secu, code_regime, caisse, centre,
      adresse, code_postal, ville, telephone, email,
      nom_prescripteur, date_ordonnance,
      num_secu_raw, num_secu_base, cle_secu,
      date_naissance_fr: toFR(date_naissance),
      date_ordonnance_fr: toFR(date_ordonnance),
      nom_upper: nom.toUpperCase(), nom_cap: cap(nom),
      prenom_upper: prenom.toUpperCase(), prenom_cap: cap(prenom),
    };
  }

  // ─── Sauvegarde patient ───────────────────────────────────────────────────
  function savePatientData() {
    const data = {};
    PATIENT_FIELDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) data[id] = el.value;
    });
    chrome.storage.local.set({ formData: data });
  }

  function loadPatientData(cb) {
    chrome.storage.local.get(['formData', 'settings'], ({ formData, settings }) => {
      if (formData) {
        PATIENT_FIELDS.forEach(id => {
          const el = document.getElementById(id);
          if (el && formData[id] !== undefined) el.value = formData[id];
        });
      }
      if (settings) {
        SETTINGS_KEYS.forEach(key => {
          const el = document.getElementById(`setting-${key}`);
          if (el && settings[key] !== undefined) el.checked = settings[key];
        });
      }
      if (cb) cb();
    });
  }

  function getSettings() {
    const s = {};
    SETTINGS_KEYS.forEach(key => {
      const el = document.getElementById(`setting-${key}`);
      s[key] = el ? el.checked : true;
    });
    return s;
  }

  SETTINGS_KEYS.forEach(key => {
    const el = document.getElementById(`setting-${key}`);
    if (el) el.addEventListener('change', () => chrome.storage.local.set({ settings: getSettings() }));
  });

  // ─── Bouton Remplir patient ───────────────────────────────────────────────
  const btnFill  = document.getElementById('btn-fill');
  const statusEl = document.getElementById('status');

  btnFill.addEventListener('click', async () => {
    const settings = getSettings();
    if (settings.save_data) savePatientData();
    await sendFillMessage('fill_form', { data: buildPatientData(), settings }, btnFill, statusEl);
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    PATIENT_FIELDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    chrome.storage.local.remove('formData');
    showStatus(statusEl, 'Données effacées.', '');
  });

  // ─── Réglages ─────────────────────────────────────────────────────────────
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    chrome.storage.local.clear();
    PATIENT_FIELDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    customTemplates = [];
    activeTemplateId = null;
    renderTemplateSelect();
    showTemplateEditor(false);
    showStatus(statusEl, 'Toutes les données effacées.', '');
  });

  // ─── Helpers status / flash ───────────────────────────────────────────────
  function showStatus(el, msg, type) {
    el.textContent = msg;
    el.className = `status ${type || ''}`;
    setTimeout(() => { el.textContent = ''; el.className = 'status'; }, 4000);
  }

  function flashButton(btn) {
    btn.classList.add('success');
    setTimeout(() => btn.classList.remove('success'), 1500);
  }

  async function getTargetTab() {
    // Exclure la fenêtre popup de l'extension pour trouver le vrai onglet cible
    const currentWindow = await chrome.windows.getCurrent();
    const allActiveTabs = await chrome.tabs.query({ active: true });
    return allActiveTabs.find(t =>
      t.windowId !== currentWindow.id &&
      !t.url.startsWith('chrome-extension://')
    ) || allActiveTabs.find(t => t.windowId !== currentWindow.id);
  }

  async function sendFillMessage(action, payload, btn, statusEl) {
    let tab;
    try {
      tab = await getTargetTab();
      if (!tab) throw new Error('Aucun onglet cible');
    } catch {
      showStatus(statusEl, 'Aucune page détectée. Cliquez d\'abord sur la page à remplir.', 'err');
      return;
    }
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action, ...payload });
      if (response) {
        const { filled, total } = response;
        showStatus(statusEl, `${filled} champ${filled > 1 ? 's' : ''} rempli${filled > 1 ? 's' : ''} sur ${total} détecté${total > 1 ? 's' : ''}`, 'ok');
        flashButton(btn);
      } else {
        showStatus(statusEl, 'Aucune réponse du script de contenu.', 'err');
      }
    } catch {
      showStatus(statusEl, 'Impossible de contacter la page. Rechargez-la.', 'err');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── FORMULAIRES PERSONNALISÉS ──────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  const templateSelect       = document.getElementById('template-select');
  const btnNewTemplate       = document.getElementById('btn-new-template');
  const btnDeleteTemplate    = document.getElementById('btn-delete-template');
  const templateEditor       = document.getElementById('template-editor');
  const templateFieldsSection= document.getElementById('template-fields-section');
  const templateEmptyState   = document.getElementById('template-empty-state');
  const templateNameInput    = document.getElementById('template-name');
  const customFieldsList     = document.getElementById('custom-fields-list');
  const btnAddField          = document.getElementById('btn-add-field');
  const btnSaveTemplate      = document.getElementById('btn-save-template');
  const badgeSaved           = document.getElementById('badge-saved');
  const btnFillCustom        = document.getElementById('btn-fill-custom');
  const statusCustom         = document.getElementById('status-custom');

  // ── Chargement des templates depuis storage ────────────────────────────────
  function loadCustomTemplates(cb) {
    chrome.storage.local.get(['customTemplates', 'activeTemplateId'], (result) => {
      customTemplates = result.customTemplates || [];
      activeTemplateId = result.activeTemplateId || null;
      renderTemplateSelect();
      if (activeTemplateId) {
        templateSelect.value = activeTemplateId;
        loadTemplateInEditor(activeTemplateId);
      }
      if (cb) cb();
    });
  }

  function saveCustomTemplates() {
    chrome.storage.local.set({ customTemplates, activeTemplateId });
  }

  // ── Rendu du <select> de templates ────────────────────────────────────────
  function renderTemplateSelect() {
    const current = templateSelect.value;
    templateSelect.innerHTML = '<option value="">— Choisir un formulaire —</option>';
    customTemplates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name || '(sans nom)';
      templateSelect.appendChild(opt);
    });
    if (current && customTemplates.find(t => t.id === current)) {
      templateSelect.value = current;
    }

    const hasTemplates = customTemplates.length > 0;
    templateEmptyState.style.display = hasTemplates || activeTemplateId ? 'none' : 'block';
  }

  // ── Charger un template dans l'éditeur ────────────────────────────────────
  function loadTemplateInEditor(id) {
    const tpl = customTemplates.find(t => t.id === id);
    if (!tpl) {
      showTemplateEditor(false);
      return;
    }
    activeTemplateId = id;
    templateNameInput.value = tpl.name;
    renderFieldsList(tpl.fields);
    showTemplateEditor(true);
    templateEmptyState.style.display = 'none';
  }

  function showTemplateEditor(show) {
    templateEditor.style.display = show ? 'block' : 'none';
    templateFieldsSection.style.display = show ? 'block' : 'none';
    if (!show) templateEmptyState.style.display = customTemplates.length === 0 ? 'block' : 'none';
  }

  // ── Rendu de la liste des champs ──────────────────────────────────────────
  function renderFieldsList(fields) {
    customFieldsList.innerHTML = '';
    if (!fields || fields.length === 0) {
      customFieldsList.innerHTML = '<div class="empty-fields">Aucun champ — cliquez sur "+ Ajouter un champ"</div>';
      return;
    }
    fields.forEach((field, idx) => {
      customFieldsList.appendChild(createFieldRow(field.label, field.value, idx));
    });
  }

  function createFieldRow(labelVal, valueVal, idx) {
    const row = document.createElement('div');
    row.className = 'custom-field-row';
    row.dataset.idx = idx;

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'custom-field-label-input';
    labelInput.placeholder = 'ex: Numéro adhérent';
    labelInput.value = labelVal || '';
    labelInput.title = 'Label du champ sur la page cible (utilisé pour la détection)';

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'custom-field-value-input';
    valueInput.placeholder = 'Valeur à remplir';
    valueInput.value = valueVal || '';

    const btnRemove = document.createElement('button');
    btnRemove.className = 'btn-remove-field';
    btnRemove.innerHTML = '×';
    btnRemove.title = 'Supprimer ce champ';
    btnRemove.addEventListener('click', () => {
      row.remove();
      // Si c'était le seul, afficher le message vide
      if (customFieldsList.querySelectorAll('.custom-field-row').length === 0) {
        customFieldsList.innerHTML = '<div class="empty-fields">Aucun champ — cliquez sur "+ Ajouter un champ"</div>';
      }
    });

    row.appendChild(labelInput);
    row.appendChild(valueInput);
    row.appendChild(btnRemove);
    return row;
  }

  // ── Lire les champs depuis le DOM ──────────────────────────────────────────
  function readFieldsFromDOM() {
    const rows = customFieldsList.querySelectorAll('.custom-field-row');
    const fields = [];
    rows.forEach(row => {
      const label = row.querySelector('.custom-field-label-input').value.trim();
      const value = row.querySelector('.custom-field-value-input').value;
      if (label) fields.push({ label, value });
    });
    return fields;
  }

  // ── Sélection d'un template ────────────────────────────────────────────────
  templateSelect.addEventListener('change', () => {
    const id = templateSelect.value;
    if (!id) {
      activeTemplateId = null;
      showTemplateEditor(false);
      saveCustomTemplates();
      return;
    }
    loadTemplateInEditor(id);
    saveCustomTemplates();
  });

  // ── Nouveau template ───────────────────────────────────────────────────────
  btnNewTemplate.addEventListener('click', () => {
    const id = 'tpl_' + Date.now();
    const tpl = { id, name: 'Nouveau formulaire', fields: [] };
    customTemplates.push(tpl);
    activeTemplateId = id;
    renderTemplateSelect();
    templateSelect.value = id;
    loadTemplateInEditor(id);
    templateNameInput.focus();
    templateNameInput.select();
    saveCustomTemplates();
  });

  // ── Supprimer un template ──────────────────────────────────────────────────
  btnDeleteTemplate.addEventListener('click', () => {
    if (!activeTemplateId) return;
    const name = customTemplates.find(t => t.id === activeTemplateId)?.name || 'ce formulaire';
    if (!confirm(`Supprimer "${name}" ?`)) return;
    customTemplates = customTemplates.filter(t => t.id !== activeTemplateId);
    activeTemplateId = null;
    renderTemplateSelect();
    showTemplateEditor(false);
    saveCustomTemplates();
  });

  // ── Ajouter un champ ──────────────────────────────────────────────────────
  btnAddField.addEventListener('click', () => {
    const emptyMsg = customFieldsList.querySelector('.empty-fields');
    if (emptyMsg) emptyMsg.remove();
    const idx = customFieldsList.querySelectorAll('.custom-field-row').length;
    const row = createFieldRow('', '', idx);
    customFieldsList.appendChild(row);
    row.querySelector('.custom-field-label-input').focus();
  });

  // ── Sauvegarder le template ────────────────────────────────────────────────
  btnSaveTemplate.addEventListener('click', () => {
    if (!activeTemplateId) return;
    const tpl = customTemplates.find(t => t.id === activeTemplateId);
    if (!tpl) return;
    tpl.name   = templateNameInput.value.trim() || 'Sans nom';
    tpl.fields = readFieldsFromDOM();
    saveCustomTemplates();
    renderTemplateSelect();
    templateSelect.value = activeTemplateId;

    badgeSaved.classList.add('show');
    setTimeout(() => badgeSaved.classList.remove('show'), 2000);
  });

  // Auto-sauvegarde du nom quand on quitte le champ
  templateNameInput.addEventListener('blur', () => {
    if (!activeTemplateId) return;
    const tpl = customTemplates.find(t => t.id === activeTemplateId);
    if (!tpl) return;
    tpl.name = templateNameInput.value.trim() || 'Sans nom';
    renderTemplateSelect();
    templateSelect.value = activeTemplateId;
    saveCustomTemplates();
  });

  // ── Remplir avec le template custom ──────────────────────────────────────
  btnFillCustom.addEventListener('click', async () => {
    if (!activeTemplateId) return;

    // Sauvegarder avant d'envoyer
    const tpl = customTemplates.find(t => t.id === activeTemplateId);
    if (!tpl) return;
    tpl.fields = readFieldsFromDOM();
    saveCustomTemplates();

    const fields = tpl.fields.filter(f => f.label && f.value !== undefined);
    if (fields.length === 0) {
      showStatus(statusCustom, 'Aucun champ à envoyer.', 'err');
      return;
    }

    const settings = getSettings();
    await sendFillMessage(
      'fill_custom_form',
      { fields, settings },
      btnFillCustom,
      statusCustom
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ── ANALYSE IA (Claude API) ────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  const scanZone       = document.getElementById('scan-zone');
  const scanFileInput  = document.getElementById('scan-file-input');
  const btnScanUpload  = document.getElementById('btn-scan-upload');
  const scanPreview    = document.getElementById('scan-preview');
  const scanPreviewImg = document.getElementById('scan-preview-img');
  const scanFilename   = document.getElementById('scan-filename');
  const btnAnalyze     = document.getElementById('btn-analyze');
  const scanStatus     = document.getElementById('scan-status');

  const apiKeyInput    = document.getElementById('api-key-input');
  const btnToggleKey   = document.getElementById('btn-toggle-key');
  const btnSaveApiKey  = document.getElementById('btn-save-api-key');

  let currentFileData  = null; // { base64, mediaType, isPdf, name }

  // ── Clé API ────────────────────────────────────────────────────────────────
  chrome.storage.local.get('claudeApiKey', ({ claudeApiKey }) => {
    if (claudeApiKey) apiKeyInput.value = claudeApiKey;
  });

  btnToggleKey.addEventListener('click', () => {
    apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
  });

  btnSaveApiKey.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    chrome.storage.local.set({ claudeApiKey: key });
    btnSaveApiKey.textContent = 'Sauvegardée ✓';
    btnSaveApiKey.style.color = 'var(--green)';
    setTimeout(() => { btnSaveApiKey.textContent = 'Sauvegarder la clé'; btnSaveApiKey.style.color = ''; }, 2000);
  });

  // ── Upload / drag & drop ───────────────────────────────────────────────────
  btnScanUpload.addEventListener('click', () => scanFileInput.click());
  scanFileInput.addEventListener('change', () => {
    if (scanFileInput.files[0]) handleFile(scanFileInput.files[0]);
  });

  scanZone.addEventListener('dragover', e => { e.preventDefault(); scanZone.classList.add('dragover'); });
  scanZone.addEventListener('dragleave', () => scanZone.classList.remove('dragover'));
  scanZone.addEventListener('drop', e => {
    e.preventDefault();
    scanZone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });

  function handleFile(file) {
    const isPdf = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    if (!isPdf && !isImage) {
      showScanStatus('Format non supporté (image ou PDF uniquement).', 'err');
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      const base64  = dataUrl.split(',')[1];
      const mediaType = file.type;

      currentFileData = { base64, mediaType, isPdf, name: file.name };

      // Aperçu
      if (isImage) {
        scanPreviewImg.src = dataUrl;
        scanPreviewImg.style.display = 'block';
      } else {
        scanPreviewImg.style.display = 'none';
      }
      scanFilename.textContent = file.name;
      scanPreview.style.display = 'block';
      btnAnalyze.disabled = false;
      showScanStatus('', '');
    };
    reader.readAsDataURL(file);
  }

  // ── Analyse ────────────────────────────────────────────────────────────────
  btnAnalyze.addEventListener('click', async () => {
    if (!currentFileData) return;

    const { claudeApiKey } = await chrome.storage.local.get('claudeApiKey');
    if (!claudeApiKey || !claudeApiKey.startsWith('sk-')) {
      showScanStatus('Clé API manquante — configurez-la dans Réglages.', 'err');
      return;
    }

    setBtnAnalyzeLoading(true);
    showScanStatus('Analyse en cours…', '');

    try {
      const extracted = await callClaudeApi(claudeApiKey, currentFileData);
      fillFormFromExtracted(extracted);
      showScanStatus(`✓ ${countFilled(extracted)} champ(s) détecté(s) et pré-rempli(s)`, 'ok');
    } catch (err) {
      showScanStatus(err.message || 'Erreur lors de l\'analyse.', 'err');
    } finally {
      setBtnAnalyzeLoading(false);
    }
  });

  function setBtnAnalyzeLoading(loading) {
    btnAnalyze.disabled = loading;
    btnAnalyze.innerHTML = loading
      ? '<span class="spinner"></span> Analyse en cours…'
      : '<span>✦</span> Analyser et pré-remplir';
  }

  function showScanStatus(msg, type) {
    scanStatus.textContent = msg;
    scanStatus.className = `scan-status ${type}`;
  }

  // ── Appel Claude API ───────────────────────────────────────────────────────
  async function callClaudeApi(apiKey, fileData) {
    const PROMPT = `Tu es un assistant pour opticiens. Analyse ce document (ordonnance, carte vitale, fiche patient, carte de mutuelle, etc.) et extrais les informations du patient.

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, avec ces champs (chaîne vide si non trouvé) :
{
  "civilite": "M." ou "Mme" ou "Melle" ou "",
  "nom": "",
  "prenom": "",
  "date_naissance": "YYYY-MM-DD ou vide",
  "num_secu": "numéro NIR avec espaces si trouvé, ex: 1 89 08 92 036 050 57",
  "code_regime": "",
  "caisse": "",
  "centre": "",
  "adresse": "",
  "code_postal": "",
  "ville": "",
  "telephone": "",
  "email": "",
  "nom_prescripteur": "",
  "date_ordonnance": "YYYY-MM-DD ou vide"
}`;

    let content;
    if (fileData.isPdf) {
      content = [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: fileData.base64 },
        },
        { type: 'text', text: PROMPT },
      ];
    } else {
      content = [
        {
          type: 'image',
          source: { type: 'base64', media_type: fileData.mediaType, data: fileData.base64 },
        },
        { type: 'text', text: PROMPT },
      ];
    }

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':       'application/json',
        'x-api-key':          apiKey,
        'anthropic-version':  '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Erreur API (${resp.status})`);
    }

    const result = await resp.json();
    const text = result.content?.find(b => b.type === 'text')?.text || '';

    // Extraire le JSON de la réponse (parfois entouré de ```json ... ```)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Réponse inattendue de l\'IA.');
    return JSON.parse(jsonMatch[0]);
  }

  // ── Remplissage du formulaire depuis les données extraites ─────────────────
  function fillFormFromExtracted(data) {
    const map = {
      civilite: 'civilite', nom: 'nom', prenom: 'prenom',
      date_naissance: 'date_naissance', num_secu: 'num_secu',
      code_regime: 'code_regime', caisse: 'caisse', centre: 'centre',
      adresse: 'adresse', code_postal: 'code_postal', ville: 'ville',
      telephone: 'telephone', email: 'email',
      nom_prescripteur: 'nom_prescripteur', date_ordonnance: 'date_ordonnance',
    };

    for (const [key, elId] of Object.entries(map)) {
      const val = data[key];
      if (!val) continue;
      const el = document.getElementById(elId);
      if (!el) continue;
      el.value = val;
    }

    // Reformater le NIR si rempli
    if (data.num_secu) {
      const nirEl = document.getElementById('num_secu');
      nirEl.value = formatNIR(data.num_secu);
      const digits = nirEl.value.replace(/\D/g, '');
      if (digits.length >= 3) document.getElementById('code_regime').value = digits.slice(0, 2);
      if (digits.length >= 8) document.getElementById('caisse').value = digits.slice(5, 8);
    }
  }

  function countFilled(data) {
    return Object.values(data).filter(v => v && v !== '').length;
  }

  // ─── Bouton ouvrir dans une fenêtre ──────────────────────────────────────
  document.getElementById('btn-popout').addEventListener('click', () => {
    chrome.windows.create({
      url: chrome.runtime.getURL('popup/popup.html'),
      type: 'popup',
      width: 420,
      height: 680,
    });
  });

  // ─── Init ─────────────────────────────────────────────────────────────────
  loadPatientData(() => {
    loadCustomTemplates();
  });
})();
