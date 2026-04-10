import asyncio
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession
from pptx import Presentation

from app.database import async_session
from app.models import CheckResult, Presentation as PresentationModel, PresentationStatus
from app.engines.rules_engine import check_rules
from app.engines.languagetool_engine import check_languagetool
from app.engines.haiku_engine import check_haiku
from app.schemas import CheckProgressEvent


async def run_check(
    _db_unused: AsyncSession,
    presentation: PresentationModel,
    rules: dict,
) -> AsyncGenerator[str, None]:
    """Run all three check engines in parallel, yielding SSE progress events.

    Creates its own DB session instead of reusing the injected one.  The
    injected session (from FastAPI's Depends) may be closed before the SSE
    generator is fully consumed by sse_starlette, which would silently lose
    the final status/score commit.
    """
    presentation_id = presentation.id
    pptx_path = presentation.original_pptx_path

    # Collect events here; we can't yield inside the async-with and maintain
    # a clean session, so we buffer, flush after DB work is done.
    # Actually: Python *does* allow yield inside async-with — we just do it.
    async with async_session() as db:
        presentation = await db.get(PresentationModel, presentation_id)

        # Mark as in-progress
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

        # Yield start events for each engine
        yield _sse_event(CheckProgressEvent(engine="rules", status="started"))
        yield _sse_event(CheckProgressEvent(engine="languagetool", status="started"))
        yield _sse_event(CheckProgressEvent(engine="haiku", status="started"))

        # Run engines in parallel
        tasks = [
            asyncio.create_task(_wrap_engine("rules", lambda: check_rules(pptx_path, rules))),
            asyncio.create_task(
                _wrap_engine_async("languagetool", lambda: check_languagetool(pptx_path))
            ),
            asyncio.create_task(
                _wrap_engine_async("haiku", lambda: check_haiku(pptx_path))
            ),
        ]

        all_errors = []
        coverage = 100.0

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
                errors_found=len(errors) if isinstance(errors, list) else 0,
            ))

        # Persist results
        for err in all_errors:
            db.add(CheckResult(
                presentation_id=presentation_id,
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
            ))

        # Calculate score
        weights = rules.get("severity_weights", {"critical": 5, "warning": 2, "info": 0})
        score = (
            max(0.0, 100.0 - sum(weights.get(e["severity"], 0) for e in all_errors))
            if total_slides > 0
            else 100.0
        )

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
