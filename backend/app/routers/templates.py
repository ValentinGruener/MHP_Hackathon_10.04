import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import Template
from app.schemas import TemplateCreate, TemplateResponse, TemplateRulesUpdate
from app.services.sanitize import sanitize_upload
from app.services.template_extractor import extract_cd_rules
from app.services.yaml_importer import yaml_to_cd_rules

router = APIRouter()


@router.post("/", response_model=TemplateResponse)
async def upload_template(
    name: str = Form(...),
    department: str = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a CD template PPTX and extract rules automatically."""
    file_id = uuid.uuid4().hex
    dest_path = settings.upload_dir / "templates" / f"{file_id}.pptx"

    await sanitize_upload(
        file,
        dest_path,
        max_size_mb=settings.max_file_size_mb,
        max_decompress_ratio=settings.max_decompress_ratio,
    )

    # Extract CD rules from the template
    rules = extract_cd_rules(dest_path)

    template = Template(
        name=name,
        department=department,
        source_pptx_path=str(dest_path),
        rules=rules,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)

    return template


@router.post("/import-yaml", response_model=TemplateResponse)
async def import_yaml_template(
    name: str = Form(...),
    department: str = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Import a ci_guidelines.yaml and create a template from it."""
    content = await file.read()
    try:
        rules = yaml_to_cd_rules(content)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Ungültige YAML-Datei: {e}")

    template = Template(
        name=name,
        department=department,
        source_pptx_path="",   # no PPTX file for YAML-imported templates
        rules=rules,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.get("/", response_model=list[TemplateResponse])
async def list_templates(db: AsyncSession = Depends(get_db)):
    """List all CD templates."""
    result = await db.execute(select(Template).order_by(Template.created_at.desc()))
    return result.scalars().all()


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(template_id: int, db: AsyncSession = Depends(get_db)):
    """Get template details including rules."""
    template = await db.get(Template, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template nicht gefunden")
    return template


@router.put("/{template_id}/rules", response_model=TemplateResponse)
async def update_rules(
    template_id: int,
    rules_update: TemplateRulesUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Manually adjust CD rules for a template."""
    template = await db.get(Template, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template nicht gefunden")

    current_rules = dict(template.rules)
    update_data = rules_update.model_dump(exclude_none=True)
    current_rules.update(update_data)
    template.rules = current_rules

    await db.commit()
    await db.refresh(template)
    return template
