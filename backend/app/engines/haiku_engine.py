import asyncio
import json

import anthropic

from app.config import settings

SYSTEM_PROMPT = """Du bist ein Corporate-Identity-Prüfassistent fuer Dokumente.
Du bekommst Seiten eines PDF-Dokuments als Bilder UND den extrahierten Text.
Dazu bekommst du die CI-Richtlinien als YAML/JSON.

Pruefe das Dokument in folgenden Kategorien:

1. **Stil** — Visuell, Font, Schriftart, Sprachstil, Farben, Layout
   - Werden die richtigen Schriftarten und Farben verwendet?
   - Stimmt der Sprachstil (formal/informell, Aktiv/Passiv)?
   - Werden verbotene Formulierungen verwendet?
   - Ist das visuelle Layout CI-konform?

2. **Formalitaeten** — Ansprechpersonen, Anschrift, Gendern
   - Wird gender-neutrale Sprache verwendet?
   - Sind Pflichthinweise (Copyright, Disclaimer) vorhanden?
   - Ist das Datumsformat korrekt?
   - Sind Kontaktdaten vorhanden wo noetig?

3. **Struktur** — Aufbau des Dokuments
   - Sind erforderliche Abschnitte vorhanden (Titel, Agenda, Abschluss)?
   - Ist die Seitenanzahl im erlaubten Bereich?
   - Gibt es leere oder unvollstaendige Seiten?
   - Ist das Logo korrekt platziert?

4. **Firmeninterne Begriffe** — Abkuerzungen, Slang, Knowhow
   - Werden inkonsistente Begriffe oder Abkuerzungen verwendet?
   - Gibt es Platzhalter-Text der nicht ersetzt wurde?
   - Werden verbotene Woerter oder Phrasen benutzt?

WICHTIG: Analysiere die BILDER visuell — pruefe Farben, Schriftarten, Logo-Platzierung,
Layout und Design gegen die CI-Richtlinien. Der Text allein reicht nicht.

Bewerte JEDEN gefundenen Fehler mit severity:
- critical: Muss vor Veroeffentlichung behoben werden
- warning: Sollte behoben werden
- info: Empfehlung zur Verbesserung

Antworte NUR mit dem Tool-Aufruf. Keine zusaetzliche Erklaerung."""

CHECK_TOOL = {
    "name": "report_errors",
    "description": "Melde alle CI-Compliance-Fehler strukturiert nach Kategorien",
    "input_schema": {
        "type": "object",
        "properties": {
            "errors": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "page_number": {"type": "integer", "description": "Seitennummer"},
                        "category": {
                            "type": "string",
                            "enum": ["stil", "formalitaeten", "struktur", "firmeninterne_begriffe"],
                            "description": "CI-Pruefkategorie",
                        },
                        "error_type": {
                            "type": "string",
                            "enum": [
                                "wrong_font",
                                "wrong_color",
                                "wrong_tone",
                                "forbidden_phrase",
                                "missing_disclaimer",
                                "missing_gendering",
                                "wrong_date_format",
                                "missing_section",
                                "empty_content",
                                "too_much_text",
                                "placeholder_text",
                                "inconsistent_terms",
                                "forbidden_abbreviation",
                                "missing_logo",
                                "logo_wrong_position",
                                "layout_violation",
                                "style_violation",
                                "other",
                            ],
                        },
                        "severity": {
                            "type": "string",
                            "enum": ["critical", "warning", "info"],
                        },
                        "description": {
                            "type": "string",
                            "description": "Klare Beschreibung des Problems auf Deutsch",
                        },
                        "suggestion": {
                            "type": "string",
                            "description": "Konkreter Verbesserungsvorschlag",
                        },
                        "current_value": {
                            "type": "string",
                            "description": "Der aktuelle fehlerhafte Wert/Text",
                        },
                    },
                    "required": ["page_number", "category", "error_type", "severity", "description"],
                },
            },
            "summary": {
                "type": "object",
                "properties": {
                    "stil_score": {"type": "integer", "description": "Bewertung Stil 0-100"},
                    "formalitaeten_score": {"type": "integer", "description": "Bewertung Formalitaeten 0-100"},
                    "struktur_score": {"type": "integer", "description": "Bewertung Struktur 0-100"},
                    "begriffe_score": {"type": "integer", "description": "Bewertung Firmeninterne Begriffe 0-100"},
                    "overall_feedback": {"type": "string", "description": "Kurzes Gesamtfeedback auf Deutsch (2-3 Saetze)"},
                },
                "required": ["stil_score", "formalitaeten_score", "struktur_score", "begriffe_score", "overall_feedback"],
            },
        },
        "required": ["errors", "summary"],
    },
}


async def check_pdf_with_ai(pdf_data: dict, ci_rules: dict | None = None) -> list[dict]:
    """Run visual + semantic CI compliance checks via Claude with multimodal input.

    Args:
        pdf_data: Output of pdf_parser.parse_pdf() — pages with text and base64 images
        ci_rules: The YAML CI guidelines as a dict
    """
    if not settings.anthropic_api_key:
        return []

    pages = pdf_data.get("pages", [])
    if not pages:
        return []

    # Batch pages (max ~5 pages per request to stay within token limits)
    batch_size = 5
    batches = [
        pages[i : i + batch_size]
        for i in range(0, len(pages), batch_size)
    ]

    results = await asyncio.gather(
        *[_check_batch(batch, ci_rules, pdf_data["num_pages"]) for batch in batches],
        return_exceptions=True,
    )

    all_errors = []
    for result in results:
        if isinstance(result, Exception):
            continue
        all_errors.extend(result)

    return all_errors


async def _check_batch(pages_batch: list[dict], ci_rules: dict | None, total_pages: int) -> list[dict]:
    """Send a batch of PDF pages (images + text) to Claude for CI checking."""
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    # Build multimodal content: images + text for each page
    content_blocks = []

    if ci_rules:
        rules_json = json.dumps(ci_rules, indent=2, ensure_ascii=False)
        content_blocks.append({
            "type": "text",
            "text": f"## CI-Richtlinien\n\n```json\n{rules_json}\n```\n\n## Dokument ({total_pages} Seiten total)\n\nPruefe die folgenden Seiten visuell UND inhaltlich gegen die CI-Richtlinien:\n",
        })

    for page in pages_batch:
        # Add page image
        content_blocks.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": page["image_base64"],
            },
        })
        # Add page text
        content_blocks.append({
            "type": "text",
            "text": f"--- Seite {page['page_number']} (Text) ---\n{page['text'] or '(kein Text erkannt)'}\n",
        })

    try:
        response = await client.messages.create(
            model=settings.anthropic_model,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=[CHECK_TOOL],
            tool_choice={"type": "tool", "name": "report_errors"},
            messages=[
                {"role": "user", "content": content_blocks},
            ],
        )
    except Exception as e:
        import traceback
        print(f"Claude API error: {e}")
        traceback.print_exc()
        raise

    errors = []
    for block in response.content:
        if block.type == "tool_use" and block.name == "report_errors":
            tool_input = block.input
            for err in tool_input.get("errors", []):
                errors.append({
                    "slide_number": err["page_number"],
                    "engine": "haiku",
                    "error_type": err.get("error_type", "other"),
                    "severity": err.get("severity", "info"),
                    "description": err.get("description", ""),
                    "suggestion": err.get("suggestion"),
                    "current_value": err.get("current_value"),
                    "expected_value": None,
                    "auto_fixable": False,
                    "category": err.get("category", "stil"),
                })

            summary = tool_input.get("summary")
            if summary:
                errors.append({
                    "slide_number": 0,
                    "engine": "haiku",
                    "error_type": "ci_summary",
                    "severity": "info",
                    "description": summary.get("overall_feedback", ""),
                    "suggestion": json.dumps({
                        "stil": summary.get("stil_score", 0),
                        "formalitaeten": summary.get("formalitaeten_score", 0),
                        "struktur": summary.get("struktur_score", 0),
                        "begriffe": summary.get("begriffe_score", 0),
                    }),
                    "current_value": None,
                    "expected_value": None,
                    "auto_fixable": False,
                    "category": "summary",
                })

    return errors
