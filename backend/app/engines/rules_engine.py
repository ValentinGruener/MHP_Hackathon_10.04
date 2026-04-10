from pptx import Presentation
from pptx.util import Emu

from app.models import Severity


def check_rules(pptx_path: str, rules: dict) -> list[dict]:
    """Run rule-based CD checks against a presentation."""
    prs = Presentation(pptx_path)
    errors = []
    total_elements = 0
    checked_elements = 0

    allowed_fonts = set(rules.get("allowed_fonts", []))
    allowed_sizes = set(rules.get("allowed_font_sizes", []))
    color_palette = set(c.upper().lstrip("#") for c in rules.get("color_palette", []))
    logo_spec = rules.get("logo_position")

    for slide_idx, slide in enumerate(prs.slides, start=1):
        for shape in slide.shapes:
            total_elements += 1

            # Font & size checks
            if shape.has_text_frame:
                checked_elements += 1
                for para in shape.text_frame.paragraphs:
                    for run in para.runs:
                        # Font check
                        if run.font.name and allowed_fonts and run.font.name not in allowed_fonts:
                            errors.append(_make_error(
                                slide_number=slide_idx,
                                error_type="wrong_font",
                                severity=Severity.critical,
                                description=f'Schriftart "{run.font.name}" ist nicht im CD erlaubt',
                                suggestion=f'Erlaubte Schriften: {", ".join(sorted(allowed_fonts))}',
                                current_value=run.font.name,
                                expected_value=sorted(allowed_fonts)[0] if allowed_fonts else None,
                                auto_fixable=True,
                                shape=shape,
                            ))

                        # Font size check
                        if run.font.size and allowed_sizes:
                            size_pt = run.font.size.pt
                            if size_pt not in allowed_sizes:
                                closest = min(allowed_sizes, key=lambda s: abs(s - size_pt))
                                errors.append(_make_error(
                                    slide_number=slide_idx,
                                    error_type="wrong_font_size",
                                    severity=Severity.warning,
                                    description=f"Schriftgröße {size_pt}pt nicht im CD",
                                    suggestion=f"Nächste erlaubte Größe: {closest}pt",
                                    current_value=str(size_pt),
                                    expected_value=str(closest),
                                    auto_fixable=True,
                                    shape=shape,
                                ))

                        # Color check
                        if run.font.color and run.font.color.rgb and color_palette:
                            rgb = str(run.font.color.rgb).upper()
                            if rgb not in color_palette:
                                errors.append(_make_error(
                                    slide_number=slide_idx,
                                    error_type="wrong_color",
                                    severity=Severity.warning,
                                    description=f"Farbe #{rgb} nicht in CD-Palette",
                                    suggestion=f"CD-Farben: {', '.join('#' + c for c in sorted(color_palette)[:5])}",
                                    current_value=f"#{rgb}",
                                    expected_value=None,
                                    auto_fixable=True,
                                    shape=shape,
                                ))

            # Empty slide check
            slide_text = "".join(
                shape.text_frame.text
                for shape in slide.shapes
                if shape.has_text_frame
            ).strip()
            # Only flag once per slide
            if not slide_text and shape == list(slide.shapes)[-1]:
                errors.append(_make_error(
                    slide_number=slide_idx,
                    error_type="empty_slide",
                    severity=Severity.critical,
                    description="Leere Folie ohne Textinhalt",
                    suggestion="Folie entfernen oder Inhalt hinzufügen",
                    auto_fixable=False,
                    shape=None,
                ))

        # Missing title check
        if not slide.shapes.title:
            errors.append(_make_error(
                slide_number=slide_idx,
                error_type="missing_title",
                severity=Severity.warning,
                description="Folie hat keinen Titel",
                suggestion="Titel-Platzhalter hinzufügen",
                auto_fixable=False,
                shape=None,
            ))

    coverage = (checked_elements / total_elements * 100) if total_elements > 0 else 100.0

    return errors, coverage


def _make_error(
    slide_number: int,
    error_type: str,
    severity: Severity,
    description: str,
    suggestion: str | None = None,
    current_value: str | None = None,
    expected_value: str | None = None,
    auto_fixable: bool = False,
    shape=None,
) -> dict:
    pos = {}
    if shape is not None:
        try:
            pos = {
                "position_x": shape.left,
                "position_y": shape.top,
                "position_w": shape.width,
                "position_h": shape.height,
            }
        except Exception:
            pass

    return {
        "slide_number": slide_number,
        "engine": "rules",
        "error_type": error_type,
        "severity": severity.value,
        "description": description,
        "suggestion": suggestion,
        "current_value": current_value,
        "expected_value": expected_value,
        "auto_fixable": auto_fixable,
        **pos,
    }
