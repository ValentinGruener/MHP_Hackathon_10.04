# MHP PowerPoint CD-Checker & Auto-Corrector

## Problem

Beratungsunternehmen (wie MHP) haben strenge Corporate-Design-Richtlinien für Präsentationen. Berater erstellen hunderte Slides pro Woche, die alle dem CD entsprechen müssen: richtige Schriftarten, Farben, Logo-Platzierung, Abstände, Formatierung. Aktuell prüft das entweder niemand systematisch, oder es kostet manuell Stunden. Ergebnis: inkonsistente Präsentationen beim Kunden, verlorene Markenqualität.

## Lösung

Ein Web-Tool in MHP UI, das:
1. **Admins** eine CD-Vorlage (Master-PPTX) hochladen lässt als Referenz
2. **Endnutzer** ihre Präsentation hochladen und automatisch prüfen lassen
3. **Fehler flaggt** mit visueller Markierung pro Slide (error-first, nicht slide-first)
4. **Auto-Korrektur** anbietet mit Diff-Preview und Per-Error Accept/Reject

## Nutzer & Rollen

### Admin
- Lädt CD-Vorlage (Master-PPTX) hoch
- Definiert Prüfregeln (welche Schriften erlaubt, Farbpalette, Logo-Position)
- Regel-Editor: Farbpicker, Font-Dropdowns, Spacing-Inputs
- Sieht Dashboard mit Nutzungsstatistiken

### Endnutzer (Berater)
- Lädt eigene PPTX hoch (Drag & Drop)
- Wählt gegen welches CD-Template geprüft wird
- Sieht Ergebnis: Score-Dashboard → Error-Liste → Slide-Drill-Down
- Kann Korrekturen per Diff-Preview prüfen und einzeln oder batch akzeptieren
- Lädt korrigierte PPTX herunter

---

## Technische Architektur

### Architektur-Diagramm

```
┌─────────────────────────────────────────────────────┐
│                    MHP UI (React)                    │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Upload   │  │ Result View  │  │ Correction    │  │
│  │ Component│  │ Score+Errors │  │ Diff Preview  │  │
│  └────┬─────┘  └──────▲───────┘  └───────┬───────┘  │
└───────┼───────────────┼──────────────────┼──────────┘
        │               │ SSE              │
┌───────▼───────────────┼──────────────────▼──────────┐
│                  FastAPI Backend                      │
│  ┌─────────────┐  ┌───┴────────┐  ┌──────────────┐  │
│  │ Upload      │  │ Check      │  │ Correction   │  │
│  │ + Sanitize  │  │ Engine     │  │ Engine       │  │
│  │ + Parse     │  │ (async)    │  │ (+ validate) │  │
│  └────┬────────┘  └───┬────────┘  └──────┬───────┘  │
│       │        ┌──────┼──────┐           │           │
│       │        ▼      ▼      ▼           │           │
│       │   ┌──────┐┌──────┐┌──────┐       │           │
│       │   │Rules ││Lang- ││Haiku │       │           │
│       │   │Check ││Tool  ││4.5   │       │           │
│       │   │      ││      ││(sem.)│       │           │
│       │   └──────┘└──────┘└──────┘       │           │
│       │     parallel via asyncio         │           │
└───────┼──────────────────────────────────┼───────────┘
        │                                  │
┌───────▼──────────────────────────────────▼───────────┐
│              Infrastructure                           │
│  ┌────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ S3     │  │ LibreOffice  │  │ PostgreSQL       │  │
│  │ Storage│  │ Headless     │  │ (templates,      │  │
│  │        │  │ (thumbnails) │  │  results, jobs)  │  │
│  └────────┘  └──────────────┘  └──────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Stack

| Komponente | Technologie | Warum |
|-----------|-------------|-------|
| Frontend | React (MHP UI) | Vorgegeben durch MHP |
| State | React Query | Server-state caching, optimistic updates |
| Backend | Python / FastAPI | Async-native, python-pptx Ökosystem |
| PPTX Parsing | python-pptx | Standard-Library, aktiv maintained |
| Spelling/Grammar | LanguageTool (self-hosted) | Schneller, günstiger, zuverlässiger als LLM |
| Semantische Prüfung | Claude Haiku 4.5 API | Platzhalter-Erkennung, Konsistenz, ~$0.10-0.30/Check |
| Thumbnails | LibreOffice Headless | python-pptx kann nicht rendern, einzige Open-Source-Option |
| Storage | S3-kompatibler Store | PPTX-Dateien, generierte Thumbnails |
| Datenbank | PostgreSQL | Templates, Ergebnisse, Jobs |
| Progress | SSE (Server-Sent Events) | Einfacher als WebSocket für one-way Progress-Streaming |

### Warum kein Celery/Redis in v1

FastAPI background tasks + `asyncio.gather` reichen für die parallele Ausführung der drei Check-Engines. Celery/Redis ist Overhead für v1. Bei Skalierung auf >10 gleichzeitige Checks evaluieren.

---

## Features (v1)

### 1. CD-Template-Management (Admin)

- Upload von Master-PPTX-Dateien
- Automatische Extraktion der CD-Regeln aus der Vorlage:
  - Erlaubte Schriftarten und -größen
  - Farbpalette (primär, sekundär, akzent)
  - Logo-Positionierung und -Größe
  - Seitenränder und Abstände
  - Slide-Layouts und Master-Slides
- Manuelle Regel-Anpassung über UI:
  - Farbpicker für Palette
  - Font-Dropdown mit erlaubten Schriften
  - Numerische Inputs für Abstände/Ränder
  - Toggle pro Regel (aktiv/inaktiv)
- Ein Template pro Abteilung/Kunde (kein Multi-Tenant in v1)

### 2. PPTX-Upload mit Security-Pipeline

```python
# sanitize_upload() Pipeline
1. Validiere ZIP-Struktur (PPTX = ZIP)
2. Prüfe Decompress-Ratio (<100:1, sonst Zip-Bomb)
3. Reject PPTM / Dateien mit vbaProject.bin (Macros)
4. Validiere alle internen Pfade (kein ../../)
5. Scanne oleObject-Parts (embedded executables)
6. Prüfe Dateigröße (<100MB)
7. Parse mit python-pptx (defusedxml für custom XML)
```

- Drag & Drop Upload
- Sofortiges Feedback bei Rejection (Grund anzeigen)
- Thumbnail-Generierung async via LibreOffice Headless (eigener Container)

### 3. Drei parallele Check-Engines

#### 3a. Rules Engine (regelbasiert, ~1-2s)
- Schriftart-Check: Verwendete vs. erlaubte Fonts
- Schriftgrößen-Check: Konsistenz mit CD-Vorgaben
- Farb-Check: Verwendete Farben vs. CD-Palette
- Logo-Check: Position, Größe, Vorhandensein
- Layout-Check: Abstände, Ränder, Ausrichtung
- Master-Slide-Check: Korrekte Verwendung der Layouts

#### 3b. LanguageTool Engine (self-hosted, ~10-25s parallel)
- Rechtschreibung (deutsch/englisch)
- Grammatik
- Satzzeichen
- Parallelisiert: mehrere Slides gleichzeitig via `asyncio.gather`

#### 3c. Haiku 4.5 Semantic Engine (~5-15s batched)
- Platzhalter-Text erkennen ("Lorem ipsum", "Text hier einfügen")
- Leere Slides flaggen
- Fehlende Slide-Titel
- Konsistenz von Begriffen und Abkürzungen
- Inhaltliche Vollständigkeit (fehlende Agenda, Zusammenfassung)
- **Prompt-Struktur:** `tool_use` für strukturierte JSON-Ausgabe
- **Batch:** 10-15 Slides pro API-Call
- **Schema:** `{slide_id, errors: [{type, severity, text, suggestion, position}]}`
- **Kosten:** ~$0.10-0.30 pro 50-Slide-Check

#### python-pptx Limitierungen (bekannt)

| Element | Support | Workaround |
|---------|---------|------------|
| Text in Shapes | Voll | — |
| Tabellen | Voll | — |
| Grouped Shapes | Partial | Rekursive Traversierung |
| SmartArt | Kein Text | Fallback auf raw XML |
| Charts | Limited | `c:chart` XML direkt parsen |
| Embedded OLE | Nein | Skip + Warning |
| Animationen | Nein | Ignorieren (nicht CD-relevant) |

**Coverage Score:** Jede Prüfung zeigt an, wieviel % des Slide-Inhalts tatsächlich prüfbar war.

### 4. Ergebnis-Ansicht (Error-First)

**Informations-Hierarchie (korrigiert):**

```
┌─────────────────────────────────────────────────┐
│  SCORE: 73% CD-konform    [Download] [Fix All]  │
│  ██████████████░░░░░░                            │
│  12 Kritisch  |  8 Warnung  |  3 Info           │
├──────────────────────┬──────────────────────────┤
│  Error-Liste         │  Slide-Preview           │
│  (filterbar,         │  (mit Markierungen)       │
│   sortierbar)        │                           │
│                      │  ┌───────────────────┐    │
│  ❌ Slide 3: Font    │  │                   │    │
│     "Arial" statt    │  │   [Slide-Thumb]   │    │
│     "MHP Sans"       │  │   mit Overlays    │    │
│                      │  │                   │    │
│  ❌ Slide 7: Farbe   │  └───────────────────┘    │
│     #FF0000 nicht    │                           │
│     in CD-Palette    │                           │
│                      │                           │
│  ⚠️ Slide 12: Typo  │                           │
│     "Stategie" →     │                           │
│     "Strategie"      │                           │
├──────────────────────┴──────────────────────────┤
│  Coverage: 94% des Inhalts geprüft              │
│  (SmartArt auf Slide 5, 9 nicht prüfbar)        │
└─────────────────────────────────────────────────┘
```

**Error-Markierung auf Slides:**
- Bounding-Box-Overlay pro Fehler (farbcodiert: rot/gelb/blau)
- Hover: Tooltip mit Fehlerdetail + "Fix"-Button
- Click: Detail-Panel expandiert rechts
- Multi-Error: Stacked Count Badge bei Überlappung

**States die designed werden müssen:**

| State | Was der User sieht |
|-------|-------------------|
| Uploading | Progress-Bar mit Dateiname |
| Checking | Progress pro Engine (Rules ✅ LangTool ⏳ Haiku ⏳) |
| Clean (0 Errors) | Celebration + Download-Button |
| Errors gefunden | Score-Dashboard + Error-Liste |
| Corrupt PPTX | Rejection mit spezifischem Grund |
| Kein Template | "Admin muss erst Template hochladen" |
| Claude API down | "Semantische Prüfung nicht verfügbar, regelbasierte Ergebnisse:" |
| Partial Fix Failure | "23/25 Korrekturen erfolgreich. 2 fehlgeschlagen:" |

### 5. Auto-Korrektur mit Diff-Preview

**Korrektur-Flow:**

```
1. User klickt "Korrekturen anzeigen"
2. Diff-View öffnet sich:
   ┌──────────────────┬──────────────────┐
   │  VORHER           │  NACHHER          │
   │  Slide 3          │  Slide 3          │
   │                   │                   │
   │  [Arial]          │  [MHP Sans]       │  ← geändert
   │  #FF0000          │  #003366          │  ← geändert
   └──────────────────┴──────────────────┘
   
   ☑ Font "Arial" → "MHP Sans" (47x)
   ☑ Farbe #FF0000 → #003366 (12x)
   ☐ Logo repositionieren (1x)        ← unchecked by default (risky)
   
   [Ausgewählte anwenden]  [Alle anwenden]
   
3. Nach Anwendung: automatischer Re-Check
4. Neuer Score wird angezeigt
```

**Sicher automatisch korrigierbar:**
- Schriftart ersetzen (explizite Werte, nicht theme-inherited)
- Schriftgröße anpassen
- Farben auf CD-Palette mappen
- Text-Typos korrigieren

**Nicht automatisch korrigierbar (nur flaggen):**
- Slide-Master-Änderungen
- SmartArt-Modifikationen
- Chart-Text
- Logo mit Cropping/Effekten
- Embedded Objects

**Sicherheit:**
- Original-PPTX immer als Backup behalten
- Re-Parse der Output-PPTX zur Validierung
- Download beider Versionen (Original + Korrigiert)

---

## API-Endpunkte

```
POST   /api/templates                       # CD-Template hochladen
GET    /api/templates                       # Alle Templates listen
GET    /api/templates/:id                   # Template-Details + Regeln
PUT    /api/templates/:id/rules             # Regeln anpassen

POST   /api/presentations                   # PPTX hochladen (→ sanitize + parse)
GET    /api/presentations/:id               # Präsentation mit Slide-Thumbnails
POST   /api/presentations/:id/check         # Prüfung starten (→ 202 + job_id)
GET    /api/presentations/:id/check/stream  # SSE: Progress + Ergebnisse streamen
GET    /api/presentations/:id/results       # Finale Prüfergebnisse

POST   /api/presentations/:id/correct       # Korrekturen anwenden (mit Selection)
GET    /api/presentations/:id/preview       # Diff-Preview generieren
GET    /api/presentations/:id/download      # Korrigierte PPTX herunterladen
GET    /api/presentations/:id/original      # Original-PPTX herunterladen
```

## Datenmodell

```
Template
├── id, name, created_at
├── source_pptx_path (S3)
├── rules (JSON): fonts[], colors[], logo_spec, spacing, layouts[]
└── department/client label

Presentation
├── id, template_id, uploaded_at, user_id
├── original_pptx_path (S3)
├── corrected_pptx_path (S3, nullable)
├── status: uploading | parsing | checking | done | error
├── score (0-100)
└── coverage_percent (0-100)

CheckResult
├── id, presentation_id, slide_number
├── engine: rules | languagetool | haiku
├── error_type, severity: critical | warning | info
├── element_id, position (x, y, w, h)
├── description, suggestion
└── auto_fixable: boolean

Correction
├── id, check_result_id
├── before_value, after_value
├── status: pending | applied | failed
└── applied_at
```

---

## Nicht-funktionale Anforderungen

- Prüfung einer 50-Slide-Präsentation in unter 60 Sekunden (parallel)
- Max. Dateigröße: 100 MB (nach Sanitize-Check)
- Unterstützung für PPTX (kein PPT, kein PPTM, kein ODP)
- DSGVO-konform: Dateien werden nach 24h gelöscht
- Keyboard-Navigation: Pfeiltasten für Slides, Tab durch Errors, Enter zum Fixen
- Min. Viewport: 1024px
- ARIA-Roles für Error-Liste und Slide-Regionen

---

## Deferred to v2

| Feature | Grund |
|---------|-------|
| Multi-Tenant-Architektur | Erst validieren ob Tool adoptiert wird |
| Template-Versionierung | v1: ein Template pro Abteilung reicht |
| PDF-Report-Export | Nice-to-have, nicht core |
| Celery/Redis | Erst bei >10 gleichzeitigen Checks nötig |
| SharePoint/Teams Integration | v2 nach Adoption |
| PowerPoint Add-in | Langfristige Vision, separates Projekt |
| Batch-Check (mehrere PPTXs) | v2 Feature-Request |

---

## Offene Fragen

- Wie genau sieht die MHP UI Komponentenbibliothek aus? Gibt es bestehende Upload- oder Viewer-Komponenten?
- Gibt es bestehende CD-Richtlinien in maschinenlesbarem Format?
- Hosting: On-Premise oder Cloud? (beeinflusst LibreOffice-Container + S3-Wahl)
- Auth: Anbindung an bestehendes SSO/LDAP?
- LanguageTool: Self-hosted oder Cloud-API?

---

## Verifizierung / Test-Plan

1. **Upload-Security:** Teste mit Zip-Bomb, PPTM-als-PPTX, Path-Traversal-ZIP
2. **Parsing:** Teste mit SmartArt-heavy Deck, Chart-Deck, 100-Slide-Deck
3. **Check-Performance:** Messe Gesamtzeit für 50-Slide-Deck (Ziel: <60s)
4. **Parallel Engines:** Verifiziere dass Rules, LanguageTool, Haiku parallel laufen
5. **Auto-Correction:** Teste Font-Replace, Color-Map, Logo-Reposition — re-parse Output
6. **SSE Streaming:** Verifiziere Progress-Updates im Browser
7. **Edge Cases:** Leere PPTX, 1-Slide PPTX, Passwortgeschützte PPTX, 0 Errors

---

*Reviewed by /autoplan — CEO, Design, Eng phases. 21 findings addressed. Haiku 4.5 für semantische Checks.*
