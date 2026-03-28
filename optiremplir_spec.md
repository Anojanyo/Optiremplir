# OptiRemplir — Spec Extension Chrome

## Contexte

Extension Chrome pour opticiens. L'opticien remplit **un formulaire dans le popup** avec les infos d'un patient, puis clique sur un bouton pour **pré-remplir automatiquement** les formulaires des sites de mutuelles.

Pas de backend. Tout se passe dans le navigateur.

---

## Structure du projet

```
optiremplir/
├── manifest.json
├── popup/
│   ├── popup.html
│   └── popup.js
├── content/
│   └── autofill.js
├── background/
│   └── service_worker.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## manifest.json

- Manifest V3
- Permissions : `activeTab`, `storage`, `scripting`
- Host permissions : `<all_urls>`
- Content script : `content/autofill.js` injecté sur tous les sites, `run_at: document_idle`
- Background service worker : `background/service_worker.js`
- Action popup : `popup/popup.html`

---

## Formulaire dans le popup (`popup.html` + `popup.js`)

### Champs du formulaire

**Bloc Identité**
| id HTML | Label | Type | Notes |
|---|---|---|---|
| `civilite` | Civilité | `<select>` | Options : M. / Mme / Melle |
| `nom` | Nom | `text` | Placeholder "DUPONT" |
| `prenom` | Prénom | `text` | Placeholder "Marie" |
| `date_naissance` | Date de naissance | `date` | |

**Bloc Sécurité sociale**
| id HTML | Label | Type | Notes |
|---|---|---|---|
| `num_secu` | Numéro de sécurité sociale | `text` | Monospace, max 21 chars avec espaces |
| `code_regime` | Code régime | `text` | Max 2 chars, ex: "01" |
| `caisse` | Caisse | `text` | Max 3 chars, ex: "951" |
| `centre` | Centre | `text` | Max 4 chars, ex: "9579" |

**Bloc Coordonnées**
| id HTML | Label | Type | Notes |
|---|---|---|---|
| `adresse` | Adresse | `text` | |
| `code_postal` | Code postal | `text` | Max 5 chars |
| `ville` | Ville | `text` | |
| `telephone` | Téléphone | `tel` | |
| `email` | Email | `email` | |

**Bloc Prescripteur**
| id HTML | Label | Type | Notes |
|---|---|---|---|
| `nom_prescripteur` | Nom ophtalmo | `text` | |
| `date_ordonnance` | Date ordonnance | `date` | |

### Comportement du formulaire

**Formatage du NIR**
- Formater en temps réel à la saisie : `1 89 08 92 036 050 57` (espaces entre groupes)
- Groupes : 1 / 2 / 2 / 2 / 3 / 3 / 2
- Auto-extraire `code_regime` et `caisse` depuis le NIR quand il change

**Sauvegarde**
- Sauvegarder les données du formulaire dans `chrome.storage.local` à chaque remplissage
- Charger les données sauvegardées au démarrage du popup

**Bouton "Remplir le formulaire"**
- Au clic : construire l'objet `data` (voir section Data Object ci-dessous), l'envoyer au content script de l'onglet actif via `chrome.tabs.sendMessage`
- Afficher le résultat : nombre de champs remplis / total détectés
- Flash visuel vert sur le bouton si succès

**Bouton "Effacer"**
- Vider tous les champs + supprimer `chrome.storage.local`

### Onglet Réglages

Trois toggles booléens sauvegardés dans `chrome.storage.local` sous la clé `settings` :

| Clé | Défaut | Description |
|---|---|---|
| `simulate_typing` | `true` | Déclenche les events JS (input, change, keyup) |
| `highlight_fields` | `true` | Met un outline vert sur les champs remplis pendant 3s |
| `save_data` | `true` | Sauvegarde les données du formulaire |

Bouton "Effacer toutes les données" → `chrome.storage.local.clear()`

---

## Data Object (construit par popup.js, envoyé au content script)

```js
{
  // Valeurs brutes
  civilite,           // "M." | "Mme" | "Melle"
  nom,                // "DUPONT" (tel que saisi)
  prenom,             // "Marie"
  date_naissance,     // "1989-08-27" (format input[type=date])
  num_secu,           // "1 89 08 92 036 050 57" (formaté)
  code_regime,        // "01"
  caisse,             // "951"
  centre,             // "9579"
  adresse,
  code_postal,
  ville,
  telephone,
  email,
  nom_prescripteur,
  date_ordonnance,    // "2024-03-15" (format input[type=date])

  // Valeurs dérivées
  num_secu_raw,       // "189089203605057" (sans espaces)
  num_secu_base,      // "1890892036050" (13 premiers chiffres)
  cle_secu,           // "57" (2 derniers chiffres)

  date_naissance_fr,  // "27/08/1989" (DD/MM/YYYY)
  date_ordonnance_fr, // "15/03/2024"

  nom_upper,          // "DUPONT"
  nom_cap,            // "Dupont"
  prenom_upper,       // "MARIE"
  prenom_cap,         // "Marie"
}
```

---

## Content Script (`content/autofill.js`)

### Message reçu

```js
{
  action: 'fill_form',
  data: { /* Data Object */ },
  settings: { simulate_typing, highlight_fields, save_data }
}
```

Répondre avec : `{ filled: N, total: M }` (champs remplis / inputs détectés)

### Détection des champs

Sélectionner tous les éléments visibles et non-disabled :
```
input:not([type=hidden]):not([type=submit]):not([type=button])
:not([type=checkbox]):not([type=radio]):not([type=file]),
select, textarea
```

Pour chaque élément, collecter les **signaux** textuels :
- `el.name`, `el.id`, `el.placeholder`
- `el.getAttribute('autocomplete')`, `el.getAttribute('aria-label')`
- Texte du `<label for="el.id">` associé
- Texte du `<label>` parent wrappant l'élément
- Texte du `previousElementSibling`
- Valeurs des attributs `data-*`

Normaliser les signaux : lowercase + strip accents + strip ponctuation.

### Table de matching (patterns → champ canonique)

Chaque champ canonique a une liste de patterns (regex case-insensitive sur le signal normalisé) :

| Champ | Patterns principaux |
|---|---|
| `civilite` | `civilit`, `titre`, `gender`, `sexe`, `salutation` |
| `nom` | `nom de famille`, `last.?name`, `surname`, `nom$`, `^nom`, `lname` |
| `prenom` | `prénom`, `prenom`, `first.?name`, `fname` |
| `date_naissance` | `date.*naissance`, `naissance`, `birth.*date`, `dob` |
| `num_secu` | `sécu`, `secu`, `sécurité sociale`, `nir`, `immatriculation`, `carte.?vitale`, `assure` |
| `num_secu_base` | `nir.*13`, `base.*nir` |
| `cle_secu` | `clé.*nir`, `cle.*nir`, `clef` |
| `code_regime` | `code.*régime`, `regime`, `grand.*régime` |
| `caisse` | `caisse`, `cpam`, `organisme`, `code.*caisse` |
| `centre` | `centre`, `centre.*gestion` |
| `adresse` | `adresse`, `address`, `rue`, `street`, `voie` |
| `code_postal` | `code.?postal`, `cp$`, `zip`, `postcode` |
| `ville` | `ville`, `city`, `commune`, `localité` |
| `telephone` | `téléphone`, `telephone`, `tel`, `phone`, `mobile`, `portable` |
| `email` | `email`, `e-mail`, `mail`, `courriel` |
| `nom_prescripteur` | `prescripteur`, `médecin`, `ophtalmo`, `rpps`, `praticien` |
| `date_ordonnance` | `ordonnance`, `prescription`, `date.*ordonnance` |

### Remplissage

**Pour `<input>` et `<textarea>`**
- Si `simulate_typing` : utiliser le native setter (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set`) puis dispatcher `input`, `change`, `keyup`
- Sinon : `el.value = value` direct

**Pour `<select>` (cas civilité)**
- Comparer les options à une valueMap :
  ```
  "M."   → ["m.", "mr", "monsieur", "1"]
  "Mme"  → ["mme", "madame", "ms", "mrs", "2"]
  "Melle"→ ["melle", "mademoiselle", "miss", "3"]
  ```
- Dispatcher `change`

**Highlight** : si `highlight_fields`, appliquer `outline: 2px solid #3ecf8e` pendant 3s

**Règle** : un élément ne peut matcher qu'un seul champ canonique (prendre le premier match).

---

## Design du popup

Thème sombre, typographie soignée. Largeur fixe 380px.

**Palette**
```css
--bg: #0f1117;
--surface: #181c27;
--surface2: #1f2536;
--border: #2a3148;
--accent: #4f8ef7;
--accent-dim: #2d4f8a;
--green: #3ecf8e;
--green-dim: #1a5c3f;
--text: #e8eaf0;
--text-dim: #7a849e;
--text-muted: #4a5268;
--red: #f75f5f;
```

**Fonts** : DM Sans (UI) + DM Mono (champ NIR). Charger depuis Google Fonts.

**Layout**
- Header : logo "OptiRemplir" (icône 👁 bleu) + tab bar "Formulaire / Réglages"
- Body scrollable max-height 510px
- Labels en 10px uppercase spaced, gris
- Inputs fond `--surface2`, border `--border`, focus border `--accent`
- Bouton fill : pleine largeur, `--accent`, icône ⚡

---

## Points d'attention pour Claude Code

1. **Ne pas oublier** le `return true` dans `chrome.runtime.onMessage.addListener` pour garder le canal ouvert en async
2. **Le native setter** est nécessaire pour que React/Vue/Angular détectent le changement — ne pas juste faire `el.value =`
3. **Le NIR** : le champ `num_secu` affiche avec espaces, mais `num_secu_raw` (sans espaces) est ce qu'on envoie aux formulaires — sauf si le formulaire attend le format espacé
4. **Les dates** : `input[type=date]` retourne `YYYY-MM-DD`, mais les mutuelles veulent souvent `DD/MM/YYYY` → toujours envoyer les deux variantes
5. **Manifest V3** : pas de `background.scripts`, utiliser `background.service_worker`
