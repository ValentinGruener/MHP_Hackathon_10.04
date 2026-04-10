import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
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
)
from app.services.check_orchestrator import run_check
from app.services.pdf_parser import parse_pdf

router = APIRouter()


@router.post("/", response_model=PresentationResponse)
async def upload_presentation(
    template_id: int = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a PDF document for CI checking."""
    # Verify template exists
    template = await db.get(Template, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template nicht gefunden")

    filename = file.filename or "unknown.pdf"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext != "pdf":
        raise HTTPException(status_code=400, detail="Nur PDF-Dateien erlaubt")

    # Read and save file
    content = await file.read()
    if len(content) > settings.max_file_size_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"Datei zu gross (max {settings.max_file_size_mb} MB)")

    file_id = uuid.uuid4().hex
    upload_dir = settings.upload_dir / "presentations"
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest_path = upload_dir / f"{file_id}.pdf"
    dest_path.write_bytes(content)

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
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")

    result = await db.execute(
        select(CheckResult)
        .where(CheckResult.presentation_id == presentation_id)
        .order_by(CheckResult.severity, CheckResult.slide_number)
    )
    check_results = result.scalars().all()

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
    """Start checking a document. Returns SSE stream with progress."""
    presentation = await db.get(Presentation, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")

    if not presentation.template_id:
        raise HTTPException(status_code=400, detail="Kein Template zugeordnet")

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
    """Get check results for a document."""
    presentation = await db.get(Presentation, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")

    result = await db.execute(
        select(CheckResult)
        .where(CheckResult.presentation_id == presentation_id)
        .order_by(CheckResult.severity, CheckResult.slide_number)
    )
    return result.scalars().all()


@router.get("/{presentation_id}/original")
async def download_original(
    presentation_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Download the original PDF file."""
    presentation = await db.get(Presentation, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")

    path = presentation.original_pptx_path
    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail="Original nicht gefunden")

    return FileResponse(
        path=path,
        filename=presentation.filename,
        media_type="application/pdf",
    )


@router.get("/{presentation_id}/pages")
async def get_pages(
    presentation_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get PDF pages as base64 images for the viewer."""
    presentation = await db.get(Presentation, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")

    path = presentation.original_pptx_path
    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail="PDF nicht gefunden")

    import asyncio
    pdf_data = await asyncio.to_thread(parse_pdf, path, 200)

    return {
        "num_pages": pdf_data["num_pages"],
        "pages": [
            {
                "page_number": p["page_number"],
                "image_base64": p["image_base64"],
                "width": p["width"],
                "height": p["height"],
            }
            for p in pdf_data["pages"]
        ],
    }
