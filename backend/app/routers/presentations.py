import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.database import get_db
from app.models import (
    Presentation,
    PresentationStatus,
    CheckResult,
    Template,
)
from app.schemas import (
    PresentationResponse,
    PresentationDetailResponse,
    CheckResultResponse,
    CorrectionRequest,
    CorrectionResponse,
)
from app.services.sanitize import sanitize_upload
from app.services.check_orchestrator import run_check
from app.services.correction_engine import apply_corrections

router = APIRouter()


@router.post("/", response_model=PresentationResponse)
async def upload_presentation(
    template_id: int = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a PPTX presentation for checking."""
    # Verify template exists
    template = await db.get(Template, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template nicht gefunden")

    file_id = uuid.uuid4().hex
    filename = file.filename or "unknown.pptx"
    dest_path = settings.upload_dir / "presentations" / f"{file_id}.pptx"

    await sanitize_upload(
        file,
        dest_path,
        max_size_mb=settings.max_file_size_mb,
        max_decompress_ratio=settings.max_decompress_ratio,
    )

    presentation = Presentation(
        template_id=template_id,
        original_pptx_path=str(dest_path),
        filename=filename,
        status=PresentationStatus.parsing,
    )
    db.add(presentation)
    await db.commit()
    await db.refresh(presentation)

    return presentation


@router.get("/{presentation_id}", response_model=PresentationDetailResponse)
async def get_presentation(
    presentation_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get presentation details with check results."""
    presentation = await db.get(Presentation, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Präsentation nicht gefunden")

    result = await db.execute(
        select(CheckResult)
        .where(CheckResult.presentation_id == presentation_id)
        .order_by(CheckResult.severity, CheckResult.slide_number)
    )
    check_results = result.scalars().all()

    # Count errors by severity
    error_counts = {"critical": 0, "warning": 0, "info": 0}
    for cr in check_results:
        error_counts[cr.severity.value] += 1

    return PresentationDetailResponse(
        id=presentation.id,
        template_id=presentation.template_id,
        filename=presentation.filename,
        status=presentation.status,
        score=presentation.score,
        coverage_percent=presentation.coverage_percent,
        slide_count=presentation.slide_count,
        uploaded_at=presentation.uploaded_at,
        check_results=[CheckResultResponse.model_validate(cr) for cr in check_results],
        error_counts=error_counts,
    )


@router.get("/{presentation_id}/check")
async def start_check(
    presentation_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Start checking a presentation. Returns SSE stream with progress."""
    presentation = await db.get(Presentation, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Präsentation nicht gefunden")

    if not presentation.template_id:
        raise HTTPException(status_code=400, detail="Kein Template zugeordnet")

    # Prevent double-runs: if already checking or done, refuse
    if presentation.status in (PresentationStatus.checking, PresentationStatus.done):
        raise HTTPException(
            status_code=409,
            detail=f"Prüfung bereits {'abgeschlossen' if presentation.status == PresentationStatus.done else 'läuft'}",
        )

    template = await db.get(Template, presentation.template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template nicht gefunden")

    async def event_generator():
        async for event in run_check(db, presentation, template.rules):
            yield event

    return EventSourceResponse(event_generator())


@router.get("/{presentation_id}/results", response_model=list[CheckResultResponse])
async def get_results(
    presentation_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get check results for a presentation."""
    presentation = await db.get(Presentation, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Präsentation nicht gefunden")

    result = await db.execute(
        select(CheckResult)
        .where(CheckResult.presentation_id == presentation_id)
        .order_by(CheckResult.severity, CheckResult.slide_number)
    )
    return result.scalars().all()


@router.post("/{presentation_id}/correct")
async def correct_presentation(
    presentation_id: int,
    request: CorrectionRequest,
    db: AsyncSession = Depends(get_db),
):
    """Apply selected corrections to the presentation."""
    presentation = await db.get(Presentation, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Präsentation nicht gefunden")

    corrections = await apply_corrections(db, presentation, request.check_result_ids)

    applied = sum(1 for c in corrections if c["status"] == "applied")
    failed = sum(1 for c in corrections if c["status"] == "failed")

    return {
        "corrections": corrections,
        "summary": {
            "total": len(corrections),
            "applied": applied,
            "failed": failed,
        },
    }


@router.get("/{presentation_id}/download")
async def download_corrected(
    presentation_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Download the corrected PPTX file."""
    presentation = await db.get(Presentation, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Präsentation nicht gefunden")

    path = presentation.corrected_pptx_path
    if not path or not Path(path).exists():
        raise HTTPException(
            status_code=404,
            detail="Keine korrigierte Version verfügbar. Bitte zuerst Korrekturen anwenden.",
        )

    return FileResponse(
        path=path,
        filename=f"korrigiert_{presentation.filename}",
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )


@router.get("/{presentation_id}/original")
async def download_original(
    presentation_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Download the original PPTX file."""
    presentation = await db.get(Presentation, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Präsentation nicht gefunden")

    path = presentation.original_pptx_path
    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail="Original nicht gefunden")

    return FileResponse(
        path=path,
        filename=presentation.filename,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )
