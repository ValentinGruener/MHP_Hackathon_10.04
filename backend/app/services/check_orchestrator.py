import asyncio
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CheckResult, Presentation as PresentationModel, PresentationStatus
from app.engines.haiku_engine import check_pdf_with_ai
from app.services.pdf_parser import parse_pdf
from app.schemas import CheckProgressEvent


async def run_check(
    db: AsyncSession,
    presentation: PresentationModel,
    rules: dict,
) -> AsyncGenerator[dict, None]:
    """Parse PDF page-by-page and run AI CI compliance check, yielding SSE progress events."""
    pdf_path = presentation.original_pptx_path

    # Update status
    presentation.status = PresentationStatus.checking
    await db.commit()

    # Parse PDF
    yield _event("orchestrator", "started",
                 message="PDF wird eingelesen und Seiten werden abfotografiert...")

    try:
        pdf_data = await asyncio.to_thread(parse_pdf, pdf_path)
    except Exception as e:
        presentation.status = PresentationStatus.error
        await db.commit()
        yield _event("orchestrator", "error", message=f"PDF konnte nicht gelesen werden: {e}")
        return

    total_pages = pdf_data["num_pages"]
    presentation.slide_count = total_pages
    await db.commit()

    yield _event("orchestrator", "started", total_slides=total_pages,
                 message=f"{total_pages} Seiten erkannt und abfotografiert")

    # Run AI check
    yield _event("haiku", "started", message="KI-Analyse laeuft (visuell + inhaltlich)...")

    try:
        all_errors = await check_pdf_with_ai(pdf_data, rules)
        real_count = len([e for e in all_errors if e["error_type"] != "ci_summary"])
        print(f"[CHECK] AI returned {real_count} errors + summary")
        yield _event("haiku", "completed", errors_found=real_count,
                     message=f"KI-Analyse abgeschlossen: {real_count} Fehler gefunden")
    except Exception as e:
        import traceback
        traceback.print_exc()
        all_errors = []
        yield _event("haiku", "error", message=f"KI-Analyse fehlgeschlagen: {e}")

    # Save all errors to DB
    for err in all_errors:
        check_result = CheckResult(
            presentation_id=presentation.id,
            slide_number=err["slide_number"],
            engine=err["engine"],
            error_type=err["error_type"],
            severity=err["severity"],
            description=err["description"],
            suggestion=err.get("suggestion"),
            current_value=err.get("current_value"),
            expected_value=err.get("expected_value"),
            auto_fixable=err.get("auto_fixable", False),
            position_x=err.get("position_x"),
            position_y=err.get("position_y"),
            position_w=err.get("position_w"),
            position_h=err.get("position_h"),
        )
        db.add(check_result)

    # Calculate score
    real_errors = [e for e in all_errors if e["error_type"] != "ci_summary"]
    if total_pages > 0:
        critical_count = sum(1 for e in real_errors if e["severity"] == "critical")
        warning_count = sum(1 for e in real_errors if e["severity"] == "warning")
        score = max(0, 100 - (critical_count * 5 + warning_count * 2))
    else:
        score = 100.0

    presentation.score = score
    presentation.coverage_percent = 100.0
    presentation.status = PresentationStatus.done
    await db.commit()

    yield _event("orchestrator", "completed", errors_found=len(real_errors),
                 message=f"Pruefung abgeschlossen. Score: {score:.0f}%")


def _event(engine: str, status: str, **kwargs) -> dict:
    """Create an SSE event dict."""
    return {
        "data": CheckProgressEvent(
            engine=engine,
            status=status,
            **kwargs,
        ).model_dump_json()
    }
