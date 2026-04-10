# Aenderungslog — MHP PowerPoint CD-Checker

## 2026-04-10 — Initiale Implementierung

### Projekt-Setup
- Git-Repository initialisiert mit `.gitignore` (node_modules, venv, .env, *.db, .DS_Store)
- `CLAUDE.md` mit Projektdokumentation und gstack Skill-Routing erstellt
- `PLAN.md` mit vollstaendigem /autoplan Review (CEO, Design, Eng) erstellt

### Backend (FastAPI + Python)
- **`app/main.py`** — FastAPI App mit CORS, Lifespan (erstellt Verzeichnisse, initialisiert DB), Health-Endpoint
- **`app/config.py`** — Pydantic Settings: DB-URL, Upload-Dir, LanguageTool-URL, Anthropic API Key, Haiku 4.5 Model
- **`app/database.py`** — Async SQLAlchemy Engine mit aiosqlite, Session-Factory, `init_db()`
- **`app/models.py`** — SQLAlchemy Models: Template, Presentation, CheckResult, Correction
- **`app/schemas.py`** — Pydantic Request/Response Schemas fuer alle Endpoints
- **`app/services/sanitize.py`** — Upload-Security Pipeline: ZIP-Validierung, Zip-Bomb-Erkennung (Ratio >100:1), Makro-Pruefung (vbaProject.bin), Path-Traversal-Schutz, Extension-Whitelist
- **`app/services/template_extractor.py`** — CD-Regel-Extraktion aus Master-PPTX: Fonts, Schriftgroessen, Farben aus Slide Masters/Layouts, Theme-Farben aus XML, Logo-Position
- **`app/services/check_orchestrator.py`** — Async Orchestrator: 3 Engines parallel via `asyncio.gather`, SSE Progress Events, Score-Berechnung (100 - criticals*5 - warnings*2)
- **`app/services/correction_engine.py`** — Auto-Korrektur: Font-Ersetzung, Schriftgroesse, Farbkorrektur, Typo-Fix. Backup des Originals, Validierung durch Re-Parsing
- **`app/engines/rules_engine.py`** — Regel-basierte Pruefung: Fonts, Schriftgroessen, Farbpalette, leere Folien, fehlende Titel
- **`app/engines/languagetool_engine.py`** — LanguageTool-Integration: Text-Extraktion pro Folie, parallele Batches (10er Gruppen) via `asyncio.gather`
- **`app/engines/haiku_engine.py`** — Claude Haiku 4.5 API: Batch-Verarbeitung (15 Folien pro Call), `tool_use` fuer strukturiertes JSON, deutsches System-Prompt
- **`app/routers/templates.py`** — REST API: POST (Upload+Extraktion), GET (Liste), GET/:id (Detail), PUT/:id/rules (Regeln aktualisieren)
- **`app/routers/presentations.py`** — REST API: POST (Upload), GET/:id (Detail+Ergebnisse), POST/:id/check (SSE Stream), GET/:id/results, POST/:id/correct, GET/:id/download, GET/:id/original
- **`requirements.txt`** — Abhaengigkeiten: fastapi, uvicorn, sqlalchemy, python-pptx, anthropic, httpx, aiosqlite, sse-starlette, pydantic-settings, defusedxml, pillow, aiofiles

### Frontend (React + Vite + TypeScript)
- **`vite.config.ts`** — React Plugin, Port 3000, API-Proxy zu localhost:8000
- **`src/types/api.ts`** — TypeScript Interfaces: Template, TemplateRules, Presentation, CheckResult, CheckProgress, CorrectionResult
- **`src/hooks/useApi.ts`** — Custom Hooks: `useTemplates()` (laden, hochladen), `usePresentations()` (Upload, SSE-Check, Korrektur, Fortschritt)
- **`src/components/Header.tsx`** — Logo mit doppeltem roten Balken, "MHP CD-Checker" Titel, "Corporate Design Compliance" Untertitel, Nav-Links (Pruefen, Templates)
- **`src/components/UploadZone.tsx`** — Drag & Drop + Click Upload, Dragover-State mit radialem Gradienten
- **`src/components/ScoreDisplay.tsx`** — Score-Anzeige in Prozent, farbcodiert (gruen/gelb/rot), Fortschrittsbalken, Error-Chips, Coverage-Indikator
- **`src/components/ErrorList.tsx`** — Filterbare Fehlerliste (alle/kritisch/warnung/info/fixbar), Checkbox-Selektion, Diff-Vorschau (vorher/nachher), Batch-Korrektur
- **`src/components/CheckProgress.tsx`** — Drei Engine-Status-Punkte (pending/running/done/error) mit Spinner und Pulse-Animation
- **`src/pages/CheckerPage.tsx`** — Multi-Step Flow: Template waehlen -> Upload -> Pruefung (SSE) -> Ergebnisse (Score + Fehler + Korrektur). Reset-Funktion
- **`src/pages/AdminPage.tsx`** — Template-Upload-Formular (Name + Abteilung), Template-Grid mit Font/Farb-Tags, Erfolgs-/Fehlermeldungen
- **`src/App.tsx`** — BrowserRouter mit Header + Routes (/ -> CheckerPage, /admin -> AdminPage)
- **`src/main.tsx`** — ReactDOM Entry Point

### Design System (MHP/Porsche Dark Theme)
- **`src/styles.css`** — Vollstaendiges Dark Design System:
  - Farben: `--mhp-black: #000000`, `--mhp-near-black: #0A0A0A`, `--mhp-dark: #141414`, `--mhp-surface: #1C1C1E`
  - Akzent: `--mhp-red: #D5305E` (Porsche Rot)
  - Text: Weiss mit Opacity-Stufen (primary: #FFF, secondary: 65%, tertiary: 40%)
  - Cards mit subtilen rgba-Borders und Hover-Animationen
  - Template-Cards mit rotem Bottom-Bar auf Hover
  - Upload-Zone mit radialem Gradient-Hover-Effekt
  - Fehler-Severity-Dots mit Glow-Effekt (box-shadow)
  - Custom Dark Scrollbar
  - Responsive Grid-Layouts
  - Premium Transitions mit cubic-bezier Easing

### Architektur-Entscheidungen
- **Hybrid AI:** LanguageTool fuer Rechtschreibung/Grammatik, Claude Haiku 4.5 nur fuer semantische Pruefungen (~$0.10-0.30 pro Check)
- **Parallele Ausfuehrung:** 3 Check-Engines laufen gleichzeitig via `asyncio.gather`
- **SSE Streaming:** Echtzeit-Fortschritt waehrend der Pruefung, kein Polling
- **Diff-basierte Korrektur:** Vorschau mit vorher/nachher, kein One-Click Auto-Fix
- **Upload-Security:** Mehrstufige Validierung (ZIP-Struktur, Decompress-Ratio, Makro-Erkennung, Path-Traversal)
- **Async DB:** SQLAlchemy async mit aiosqlite fuer nicht-blockierende Datenbankzugriffe

### Offene Punkte (v2)
- LibreOffice Headless fuer Folien-Thumbnails (Infrastruktur-Abhaengigkeit)
- SmartArt-Text-Extraktion (python-pptx Limitation, Fallback auf raw XML)
- Multi-Tenant Architektur
- SharePoint/Teams Integration
- Template-Versionierung
- PDF Report Export
