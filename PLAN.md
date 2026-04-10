# MHP PowerPoint CD-Checker & Auto-Corrector

## Problem

Beratungsunternehmen (wie MHP) haben strenge Corporate-Design-Richtlinien für Präsentationen. Berater erstellen hunderte Slides pro Woche, die alle dem CD entsprechen müssen: richtige Schriftarten, Farben, Logo-Platzierung, Abstände, Formatierung. Aktuell prüft das entweder niemand systematisch, oder es kostet manuell Stunden. Ergebnis: inkonsistente Präsentationen beim Kunden, verlorene Markenqualität.

## Lösung

Ein Web-Tool in MHP UI, das:
1. **Admins** eine CD-Vorlage (Master-PPTX) hochladen lässt als Referenz
2. **Endnutzer** ihre Präsentation hochladen und automatisch prüfen lassen
3. **Fehler flaggt** mit visueller Markierung pro Slide
4. **Auto-Korrektur** anbietet, um gefundene Fehler automatisch zu fixen

## Nutzer & Rollen

### Admin
- Lädt CD-Vorlage (Master-PPTX) hoch
- Definiert Prüfregeln (welche Schriften erlaubt, Farbpalette, Logo-Position)
- Sieht Dashboard mit Nutzungsstatistiken
- Verwaltet mehrere CD-Templates (z.B. pro Kunde oder Abteilung)

### Endnutzer (Berater)
- Lädt eigene PPTX hoch
- Wählt gegen welches CD-Template geprüft wird
- Sieht Ergebnis-Ansicht mit markierten Fehlern pro Slide
- Kann einzelne oder alle Fehler auto-korrigieren lassen
- Lädt korrigierte PPTX herunter

## Features

### 1. CD-Template-Management (Admin)
- Upload von Master-PPTX-Dateien
- Automatische Extraktion der CD-Regeln aus der Vorlage:
  - Erlaubte Schriftarten und -größen
  - Farbpalette (primär, sekundär, akzent)
  - Logo-Positionierung und -Größe
  - Seitenränder und Abstände
  - Slide-Layouts und Master-Slides
- Manuelle Regel-Anpassung über UI
- Versionierung von Templates

### 2. PPTX-Upload & Parsing
- Drag & Drop Upload für PPTX-Dateien
- Serverseitiges Parsing mit python-pptx
- Extraktion aller Slide-Elemente: Text, Bilder, Shapes, Tabellen, Charts
- Thumbnail-Generierung pro Slide für die Vorschau

### 3. Automatische Prüfung

#### 3a. Format/Layout-Prüfung (regelbasiert)
- Schriftart-Check: Verwendete vs. erlaubte Fonts
- Schriftgrößen-Check: Konsistenz mit CD-Vorgaben
- Farb-Check: Verwendete Farben vs. CD-Palette
- Logo-Check: Position, Größe, Vorhandensein
- Layout-Check: Abstände, Ränder, Ausrichtung
- Master-Slide-Check: Korrekte Verwendung der Slide-Layouts

#### 3b. Inhaltsprüfung (KI-gestützt via Claude API)
- Rechtschreibung und Grammatik (deutsch/englisch)
- Typo-Erkennung
- Konsistenz von Begriffen und Abkürzungen
- Satzzeichenfehler
- Leere Slides oder Platzhalter-Text erkennen
- Fehlende Slide-Titel
- Inhaltliche Vollständigkeit (z.B. fehlende Agenda, fehlende Zusammenfassung)

### 4. Ergebnis-Ansicht
- Slide-by-Slide-Navigation mit Thumbnail-Vorschau
- Fehler-Markierungen direkt auf dem Slide (Highlighting)
- Fehler-Kategorien: Kritisch (rot), Warnung (gelb), Info (blau)
- Fehler-Liste als Sidebar mit Sprung-zu-Slide
- Gesamt-Score pro Präsentation (z.B. 85% CD-konform)
- Export des Prüfberichts als PDF

### 5. Auto-Korrektur
- Ein-Klick-Korrektur für einzelne Fehler
- "Alle korrigieren" für alle auto-fixbaren Fehler
- Korrigierbare Fehler:
  - Schriftart ersetzen
  - Farben auf CD-Palette mappen
  - Logo austauschen/repositionieren
  - Typos korrigieren
  - Leere Slides entfernen
- Vorschau der Korrektur vor Anwendung
- Download der korrigierten PPTX

## Technische Architektur

### Frontend (MHP UI)
- Framework: React (MHP UI Komponentenbibliothek)
- Slide-Viewer: Custom-Komponente basierend auf SVG/Canvas-Rendering
- File Upload: Chunked Upload für große PPTX-Dateien
- State Management: React Query für Server-State

### Backend (Python/FastAPI)
- REST API für Upload, Prüfung, Korrektur
- python-pptx für PPTX-Parsing und -Manipulation
- Async Processing: Celery + Redis für Hintergrund-Prüfungen
- File Storage: S3-kompatibler Object Store

### KI-Integration (Claude API)
- Claude API für:
  - Rechtschreibung/Grammatik-Prüfung
  - Typo-Erkennung
  - Inhaltliche Konsistenz-Prüfung
  - Korrekturvorschläge generieren
- Batch-Processing: Slides werden in Gruppen an die API gesendet
- Prompt-Engineering für präzise, strukturierte Fehlerberichte

### Datenmodell
- **Template**: CD-Vorlage mit extrahierten Regeln (JSON)
- **Presentation**: Hochgeladene PPTX mit Metadaten
- **CheckResult**: Prüfergebnis pro Slide mit Fehler-Details
- **Correction**: Angewandte Korrekturen mit Vorher/Nachher

### API-Endpunkte
```
POST   /api/templates              # CD-Template hochladen
GET    /api/templates              # Alle Templates listen
GET    /api/templates/:id          # Template-Details
PUT    /api/templates/:id/rules    # Regeln anpassen

POST   /api/presentations          # PPTX hochladen
GET    /api/presentations/:id      # Präsentation mit Slides
POST   /api/presentations/:id/check    # Prüfung starten
GET    /api/presentations/:id/results  # Prüfergebnisse

POST   /api/presentations/:id/correct       # Auto-Korrektur starten
POST   /api/presentations/:id/correct/:slideId  # Einzelne Slide korrigieren
GET    /api/presentations/:id/download      # Korrigierte PPTX herunterladen
```

## Nicht-funktionale Anforderungen
- Prüfung einer 50-Slide-Präsentation in unter 60 Sekunden
- Max. Dateigröße: 100 MB
- Unterstützung für PPTX (kein PPT, kein ODP)
- DSGVO-konform: Dateien werden nach 24h gelöscht
- Mandantenfähig: Mehrere Kunden/Abteilungen mit eigenen Templates

## Offene Fragen
- Wie genau sieht die MHP UI Komponentenbibliothek aus? Gibt es bestehende Upload- oder Viewer-Komponenten?
- Soll die Prüfung synchron (Echtzeit) oder asynchron (Queue) ablaufen?
- Gibt es bestehende CD-Richtlinien in maschinenlesbarem Format?
- Hosting: On-Premise oder Cloud?
- Auth: Anbindung an bestehendes SSO/LDAP?
