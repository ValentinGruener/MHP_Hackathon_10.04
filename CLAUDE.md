# MHP PowerPoint CD-Checker

## Projekt

Web-Tool zum Pruefen von PowerPoint-Praesentationen gegen Corporate Design Vorlagen.
Consultants laden PPTX hoch, das Tool prueft Fonts, Farben, Layouts, Rechtschreibung und Inhalt,
zeigt Fehler visuell an und bietet automatische Korrektur mit Diff-Vorschau.

## Tech Stack

- **Backend:** FastAPI, python-pptx, SQLAlchemy async (aiosqlite), LanguageTool, Claude Haiku 4.5 API
- **Frontend:** React 18, Vite, TypeScript, React Router
- **Design:** Dark MHP/Porsche Design System (schwarz, weiss, Porsche-Rot #D5305E)

## Struktur

```
backend/          FastAPI Backend (Port 8000)
  app/
    main.py       App entry, CORS, lifespan
    config.py     Pydantic Settings
    database.py   Async SQLAlchemy
    models.py     Template, Presentation, CheckResult, Correction
    schemas.py    Pydantic request/response schemas
    engines/      rules_engine, languagetool_engine, haiku_engine
    services/     sanitize, template_extractor, check_orchestrator, correction_engine
    routers/      templates, presentations

frontend/         React Frontend (Port 3000)
  src/
    components/   Header, UploadZone, ScoreDisplay, ErrorList, CheckProgress
    pages/        CheckerPage, AdminPage
    hooks/        useApi (useTemplates, usePresentations)
    types/        api.ts (TypeScript interfaces)
    styles.css    MHP Dark Design System
```

## Lokale Entwicklung

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

Frontend proxy: `/api` -> `localhost:8000`

## Architektur-Entscheidungen

- Drei Check-Engines laufen parallel (asyncio.gather): Rules, LanguageTool, Claude Haiku
- SSE fuer Echtzeit-Fortschritt waehrend der Pruefung
- LanguageTool fuer Rechtschreibung, Claude Haiku 4.5 nur fuer semantische Pruefungen
- Auto-Korrektur immer mit Diff-Vorschau, nie One-Click
- Upload-Security: sanitize_upload() Pipeline (ZIP-Bomb, XXE, Makros, Path Traversal)
- python-pptx kann kein Rendering: LibreOffice headless fuer Thumbnails (noch nicht implementiert)

## Konventionen

- Sprache im UI: Deutsch
- Code/Kommentare: Englisch
- CSS: Dark Theme mit CSS Custom Properties (--mhp-*, --text-*, --color-*)
- Keine Inline-Styles mit hartcodierten Farben, immer CSS-Variablen nutzen

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming -> invoke office-hours
- Bugs, errors, "why is this broken", 500 errors -> invoke investigate
- Ship, deploy, push, create PR -> invoke ship
- QA, test the site, find bugs -> invoke qa
- Code review, check my diff -> invoke review
- Update docs after shipping -> invoke document-release
- Weekly retro -> invoke retro
- Design system, brand -> invoke design-consultation
- Visual audit, design polish -> invoke design-review
- Architecture review -> invoke plan-eng-review
- Save progress, checkpoint, resume -> invoke checkpoint
- Code quality, health check -> invoke health
