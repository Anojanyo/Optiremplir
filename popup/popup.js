// OptiRemplir — Popup script

(function () {
  'use strict';

  const FORM_FIELDS = [
    'civilite', 'nom', 'prenom', 'date_naissance',
    'num_secu', 'code_regime', 'caisse', 'centre',
    'adresse', 'code_postal', 'ville', 'telephone', 'email',
    'nom_prescripteur', 'date_ordonnance',
  ];

  const SETTINGS_KEYS = ['simulate_typing', 'highlight_fields', 'save_data'];

  // ─── Onglets ──────────────────────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // ─── Formatage du NIR ────────────────────────────────────────────────────
  // Format : 1 / 2 / 2 / 2 / 3 / 3 / 2  → "1 89 08 92 036 050 57"
  function formatNIR(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, 15);
    const groups = [1, 2, 2, 2, 3, 3, 2];
    let result = '';
    let pos = 0;
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
    autoExtractFromNIR(formatted);
  });

  function autoExtractFromNIR(formatted) {
    const digits = formatted.replace(/\D/g, '');
    if (digits.length >= 3) {
      document.getElementById('code_regime').value = digits.slice(0, 2);
    }
    if (digits.length >= 6) {
      document.getElementById('caisse').value = digits.slice(5, 8);
    }
  }

  // ─── Data Object ─────────────────────────────────────────────────────────
  function buildDataObject() {
    const get = id => (document.getElementById(id) || {}).value || '';

    const civilite        = get('civilite');
    const nom             = get('nom');
    const prenom          = get('prenom');
    const date_naissance  = get('date_naissance');
    const num_secu        = get('num_secu');
    const code_regime     = get('code_regime');
    const caisse          = get('caisse');
    const centre          = get('centre');
    const adresse         = get('adresse');
    const code_postal     = get('code_postal');
    const ville           = get('ville');
    const telephone       = get('telephone');
    const email           = get('email');
    const nom_prescripteur = get('nom_prescripteur');
    const date_ordonnance = get('date_ordonnance');

    const num_secu_raw  = num_secu.replace(/\D/g, '');
    const num_secu_base = num_secu_raw.slice(0, 13);
    const cle_secu      = num_secu_raw.slice(13, 15);

    const toFR = iso => {
      if (!iso) return '';
      const [y, m, d] = iso.split('-');
      return `${d}/${m}/${y}`;
    };

    const capitalize = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';

    return {
      civilite, nom, prenom, date_naissance,
      num_secu, code_regime, caisse, centre,
      adresse, code_postal, ville, telephone, email,
      nom_prescripteur, date_ordonnance,

      num_secu_raw,
      num_secu_base,
      cle_secu,

      date_naissance_fr: toFR(date_naissance),
      date_ordonnance_fr: toFR(date_ordonnance),

      nom_upper:    nom.toUpperCase(),
      nom_cap:      capitalize(nom),
      prenom_upper: prenom.toUpperCase(),
      prenom_cap:   capitalize(prenom),
    };
  }

  // ─── Sauvegarde / Chargement ──────────────────────────────────────────────
  function saveFormData() {
    const data = {};
    FORM_FIELDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) data[id] = el.value;
    });
    chrome.storage.local.set({ formData: data });
  }

  function loadFormData() {
    chrome.storage.local.get(['formData', 'settings'], ({ formData, settings }) => {
      if (formData) {
        FORM_FIELDS.forEach(id => {
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

  function saveSettings() {
    chrome.storage.local.set({ settings: getSettings() });
  }

  SETTINGS_KEYS.forEach(key => {
    const el = document.getElementById(`setting-${key}`);
    if (el) el.addEventListener('change', saveSettings);
  });

  // ─── Bouton Remplir ───────────────────────────────────────────────────────
  const btnFill  = document.getElementById('btn-fill');
  const statusEl = document.getElementById('status');

  btnFill.addEventListener('click', async () => {
    const settings = getSettings();
    if (settings.save_data) saveFormData();

    const data = buildDataObject();

    let tab;
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch {
      showStatus('Impossible d\'accéder à l\'onglet.', 'err');
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'fill_form',
        data,
        settings,
      });

      if (response) {
        const { filled, total } = response;
        showStatus(`${filled} champ${filled > 1 ? 's' : ''} rempli${filled > 1 ? 's' : ''} sur ${total} détecté${total > 1 ? 's' : ''}`, 'ok');
        flashButton();
      } else {
        showStatus('Aucune réponse du script de contenu.', 'err');
      }
    } catch (e) {
      showStatus('Impossible de contacter la page. Rechargez-la.', 'err');
    }
  });

  function showStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = `status ${type || ''}`;
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'status';
    }, 4000);
  }

  function flashButton() {
    btnFill.classList.add('success');
    setTimeout(() => btnFill.classList.remove('success'), 1500);
  }

  // ─── Bouton Effacer (formulaire) ──────────────────────────────────────────
  document.getElementById('btn-clear').addEventListener('click', () => {
    FORM_FIELDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = el.tagName === 'SELECT' ? '' : '';
    });
    chrome.storage.local.remove('formData');
    showStatus('Données effacées.', '');
  });

  // ─── Bouton Effacer tout (réglages) ──────────────────────────────────────
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    chrome.storage.local.clear();
    FORM_FIELDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    showStatus('Toutes les données effacées.', '');
  });

  // ─── Init ─────────────────────────────────────────────────────────────────
  loadFormData();
})();
