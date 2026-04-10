import asyncio
import json
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession
from pptx import Presentation

from app.models import CheckResult, Presentation as PresentationModel, PresentationStatus
from app.engines.rules_engine import check_rules
from app.engines.languagetool_engine import check_languagetool
from app.engines.haiku_engine import check_haiku
from app.schemas import CheckProgressEvent


async def run_check(
    db: AsyncSession,
    presentation: PresentationModel,
    rules: dict,
) -> AsyncGenerator[str, None]:
    """Run all three check engines in parallel, yielding SSE progress events."""
    pptx_path = presentation.original_pptx_path

    # Update status
    presentation.status = PresentationStatus.checking
    await db.commit()

    prs = Presentation(pptx_path)
    total_slides = len(prs.slides)
    presentation.slide_count = total_slides
    await db.commit()

    yield _sse_event(CheckProgressEvent(
        engine="orchestrator",
        status="started",
        total_slides=total_slides,
        message=f"Prüfung gestartet: {total_slides} Folien",
    ))

    all_errors = []
    coverage = 100.0

    # Run all three engines in parallel
    async def run_rules():
        yield_event = CheckProgressEvent(engine="rules", status="started")
        errors, cov = check_rules(pptx_path, rules)
        return "rules", errors, cov

    async def run_lt():
        errors = await check_languagetool(pptx_path)
        return "languagetool", errors, None

    async def run_haiku():
        errors = await check_haiku(pptx_path)
        return "haiku", errors, None

    # Yield start events
    yield _sse_event(CheckProgressEvent(engine="rules", status="started"))
    yield _sse_event(CheckProgressEvent(engine="languagetool", status="started"))
    yield _sse_event(CheckProgressEvent(engine="haiku", status="started"))

    # Run in parallel
    tasks = [
        asyncio.create_task(_wrap_engine("rules", lambda: check_rules(pptx_path, rules))),
        asyncio.create_task(
            _wrap_engine_async("languagetool", lambda: check_languagetool(pptx_path))
        ),
        asyncio.create_task(
            _wrap_engine_async("haiku", lambda: check_haiku(pptx_path))
        ),
    ]

    for coro in asyncio.as_completed(tasks):
        engine_name, result, error_msg = await coro
        if error_msg:
            yield _sse_event(CheckProgressEvent(
                engine=engine_name,
                status="error",
                message=error_msg,
            ))
            continue

        if engine_name == "rules":
            errors, cov = result
            coverage = cov
        else:
            errors = result

        all_errors.extend(errors)
        yield _sse_event(CheckProgressEvent(
            engine=engine_name,
            status="completed",
            errors_found=len(errors) if isinstance(errors, list) else len(errors[0]) if isinstance(errors, tuple) else 0,
        ))

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
    if total_slides > 0:
        critical_count = sum(1 for e in all_errors if e["severity"] == "critical")
        warning_count = sum(1 for e in all_errors if e["severity"] == "warning")
        # Score: 100 - (criticals * 5 + warnings * 2), min 0
        score = max(0, 100 - (critical_count * 5 + warning_count * 2))
    else:
        score = 100.0

    presentation.score = score
    presentation.coverage_percent = coverage
    presentation.status = PresentationStatus.done
    await db.commit()

    yield _sse_event(CheckProgressEvent(
        engine="orchestrator",
        status="completed",
        errors_found=len(all_errors),
        message=f"Prüfung abgeschlossen. Score: {score:.0f}%, Coverage: {coverage:.0f}%",
    ))


async def _wrap_engine(name: str, fn):
    """Wrap a sync engine function for parallel execution."""
    try:
        result = await asyncio.to_thread(fn)
        return name, result, None
    except Exception as e:
        return name, None, str(e)


async def _wrap_engine_async(name: str, fn):
    """Wrap an async engine function for parallel execution."""
    try:
        result = await fn()
        return name, result, None
    except Exception as e:
        return name, None, str(e)


def _sse_event(event: CheckProgressEvent) -> str:
    """Format an SSE event string."""
    return f"data: {event.model_dump_json()}\n\n"
