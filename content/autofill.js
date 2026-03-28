// OptiRemplir — Content Script
// Détecte et remplit les champs de formulaire sur la page active

(function () {
  'use strict';

  // ─── Normalisation ────────────────────────────────────────────────────────
  function normalize(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // strip accents
      .replace(/[^\w\s]/g, ' ')         // strip ponctuation
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ─── Table de matching ────────────────────────────────────────────────────
  const FIELD_PATTERNS = [
    { field: 'civilite',         patterns: [/civilit/, /\btitre\b/, /\bgender\b/, /\bsexe\b/, /salutation/] },
    { field: 'nom',              patterns: [/nom de famille/, /last.?name/, /surname/, /\bnom$/, /^nom\b/, /\blname\b/] },
    { field: 'prenom',           patterns: [/pr[ée]nom/, /first.?name/, /\bfname\b/, /given.?name/] },
    { field: 'date_naissance',   patterns: [/date.*naissance/, /\bnaissance\b/, /birth.*date/, /\bdob\b/, /date.*nais/] },
    { field: 'num_secu',         patterns: [/s[eé]cu/, /s[eé]curit[eé].*sociale/, /\bnir\b/, /immatriculation/, /carte.?vitale/, /\bassur[eé]\b/] },
    { field: 'num_secu_base',    patterns: [/nir.*13/, /base.*nir/] },
    { field: 'cle_secu',         patterns: [/cl[eé].*nir/, /clef\b/] },
    { field: 'code_regime',      patterns: [/code.*r[eé]gime/, /\br[eé]gime\b/, /grand.*r[eé]gime/] },
    { field: 'caisse',           patterns: [/\bcaisse\b/, /\bcpam\b/, /\borganisme\b/, /code.*caisse/] },
    { field: 'centre',           patterns: [/\bcentre\b/, /centre.*gestion/] },
    { field: 'adresse',          patterns: [/\badresse\b/, /\baddress\b/, /\brue\b/, /\bstreet\b/, /\bvoie\b/] },
    { field: 'code_postal',      patterns: [/code.?postal/, /\bcp$/, /\bzip\b/, /postcode/, /code.?post/] },
    { field: 'ville',            patterns: [/\bville\b/, /\bcity\b/, /\bcommune\b/, /localit/] },
    { field: 'telephone',        patterns: [/t[eé]l[eé]phone/, /\btel\b/, /\bphone\b/, /\bmobile\b/, /\bportable\b/] },
    { field: 'email',            patterns: [/\bemail\b/, /e-mail/, /\bmail\b/, /\bcourriel\b/] },
    { field: 'nom_prescripteur', patterns: [/prescripteur/, /m[eé]decin/, /ophtalmo/, /\brpps\b/, /praticien/] },
    { field: 'date_ordonnance',  patterns: [/ordonnance/, /prescription/, /date.*ordo/] },
  ];

  // ─── Signaux textuels d'un élément ───────────────────────────────────────
  function getSignals(el) {
    const signals = [];

    if (el.name)        signals.push(el.name);
    if (el.id)          signals.push(el.id);
    if (el.placeholder) signals.push(el.placeholder);

    const autocomplete = el.getAttribute('autocomplete');
    if (autocomplete)   signals.push(autocomplete);

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel)      signals.push(ariaLabel);

    // <label for="...">
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) signals.push(label.textContent);
    }

    // <label> parent wrappant
    const parentLabel = el.closest('label');
    if (parentLabel) signals.push(parentLabel.textContent);

    // Sibling précédent
    const prev = el.previousElementSibling;
    if (prev) signals.push(prev.textContent);

    // Attributs data-*
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-')) signals.push(attr.value);
    }

    return signals.map(normalize).filter(Boolean);
  }

  // ─── Matching champ → valeur ──────────────────────────────────────────────
  function matchField(signals) {
    for (const { field, patterns } of FIELD_PATTERNS) {
      for (const signal of signals) {
        for (const pattern of patterns) {
          if (pattern.test(signal)) return field;
        }
      }
    }
    return null;
  }

  // ─── Valeur à injecter selon le champ et le type d'input ─────────────────
  function resolveValue(field, data, el) {
    const type = (el.type || '').toLowerCase();
    const isDateInput = type === 'date';

    switch (field) {
      case 'civilite':         return data.civilite;
      case 'nom':              return data.nom_upper || data.nom;
      case 'prenom':           return data.prenom_cap || data.prenom;
      case 'date_naissance':   return isDateInput ? data.date_naissance : data.date_naissance_fr;
      case 'num_secu':         return data.num_secu;
      case 'num_secu_base':    return data.num_secu_base;
      case 'cle_secu':         return data.cle_secu;
      case 'code_regime':      return data.code_regime;
      case 'caisse':           return data.caisse;
      case 'centre':           return data.centre;
      case 'adresse':          return data.adresse;
      case 'code_postal':      return data.code_postal;
      case 'ville':            return data.ville;
      case 'telephone':        return data.telephone;
      case 'email':            return data.email;
      case 'nom_prescripteur': return data.nom_prescripteur;
      case 'date_ordonnance':  return isDateInput ? data.date_ordonnance : data.date_ordonnance_fr;
      default:                 return null;
    }
  }

  // ─── Remplissage d'un <input> / <textarea> ────────────────────────────────
  function fillInput(el, value, simulateTyping) {
    if (value === undefined || value === null || value === '') return false;

    if (simulateTyping) {
      // Native setter pour que React/Vue/Angular détectent le changement
      const proto = el.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value');
      if (nativeSetter && nativeSetter.set) {
        nativeSetter.set.call(el, value);
      } else {
        el.value = value;
      }
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    } else {
      el.value = value;
    }
    return true;
  }

  // ─── Remplissage d'un <select> ────────────────────────────────────────────
  const CIVILITE_MAP = {
    'M.':    ['m.', 'mr', 'monsieur', 'm', '1'],
    'Mme':   ['mme', 'madame', 'ms', 'mrs', '2'],
    'Melle': ['melle', 'mademoiselle', 'miss', 'melle', '3'],
  };

  function fillSelect(el, field, data) {
    if (field !== 'civilite') return false;
    const wanted = data.civilite;
    if (!wanted) return false;

    const targets = CIVILITE_MAP[wanted] || [];
    for (const option of el.options) {
      const val = normalize(option.value);
      const txt = normalize(option.text);
      if (targets.includes(val) || targets.includes(txt)) {
        el.value = option.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  // ─── Highlight visuel ────────────────────────────────────────────────────
  function highlight(el) {
    const prev = el.style.outline;
    el.style.outline = '2px solid #3ecf8e';
    setTimeout(() => { el.style.outline = prev; }, 3000);
  }

  // ─── Détection des éléments remplissables ────────────────────────────────
  function getFormElements() {
    const selector = [
      'input:not([type=hidden]):not([type=submit]):not([type=button])',
      'input:not([type=checkbox]):not([type=radio]):not([type=file])',
      'select',
      'textarea',
    ].join(', ');

    return Array.from(document.querySelectorAll(selector)).filter(el => {
      if (el.disabled || el.readOnly) return false;
      // Vérifier visibilité
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  // ─── Point d'entrée ──────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action !== 'fill_form') return false;

    const { data, settings } = message;
    const { simulate_typing = true, highlight_fields = true } = settings || {};

    const elements = getFormElements();
    const total = elements.length;
    let filled = 0;
    const matched = new Set(); // un champ canonique → un seul élément

    for (const el of elements) {
      const signals = getSignals(el);
      const field = matchField(signals);
      if (!field || matched.has(field)) continue;

      let ok = false;

      if (el.tagName === 'SELECT') {
        ok = fillSelect(el, field, data);
      } else {
        const value = resolveValue(field, data, el);
        if (value) ok = fillInput(el, value, simulate_typing);
      }

      if (ok) {
        matched.add(field);
        filled++;
        if (highlight_fields) highlight(el);
      }
    }

    sendResponse({ filled, total });
    return true; // canal async ouvert
  });
})();
