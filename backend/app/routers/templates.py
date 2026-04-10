import uuid
from pathlib import Path

import yaml
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import Template
from app.schemas import TemplateCreate, TemplateResponse, TemplateRulesUpdate
from app.services.sanitize import sanitize_upload
from app.services.template_extractor import extract_cd_rules

router = APIRouter()


@router.post("/", response_model=TemplateResponse)
async def upload_template(
    name: str = Form(...),
    department: str = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a CD template — accepts YAML (.yaml/.yml) or PPTX (.pptx)."""
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext in ("yaml", "yml"):
        # YAML upload — parse and store rules directly
        content = await file.read()
        try:
            rules = yaml.safe_load(content)
        except yaml.YAMLError as e:
            raise HTTPException(status_code=400, detail=f"Ungueltige YAML-Datei: {e}")

        if not isinstance(rules, dict):
            raise HTTPException(status_code=400, detail="YAML muss ein Objekt/Dictionary sein")

        # Save YAML file to disk
        yaml_dir = settings.upload_dir / "templates"
        yaml_dir.mkdir(parents=True, exist_ok=True)
        file_id = uuid.uuid4().hex
        yaml_path = yaml_dir / f"{file_id}.yaml"
        yaml_path.write_bytes(content)

        template = Template(
            name=name,
            department=department,
            source_pptx_path=str(yaml_path),
            rules=rules,
        )

    elif ext == "pptx":
        # Legacy PPTX upload
        file_id = uuid.uuid4().hex
        dest_path = settings.upload_dir / "templates" / f"{file_id}.pptx"

        await sanitize_upload(
            file,
            dest_path,
            max_size_mb=settings.max_file_size_mb,
            max_decompress_ratio=settings.max_decompress_ratio,
        )

        rules = extract_cd_rules(dest_path)

        template = Template(
            name=name,
            department=department,
            source_pptx_path=str(dest_path),
            rules=rules,
        )

    else:
        raise HTTPException(status_code=400, detail="Nur YAML (.yaml/.yml) oder PPTX (.pptx) Dateien erlaubt")

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


@router.delete("/{template_id}", response_model=dict)
async def delete_template(template_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a CD template."""
    template = await db.get(Template, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template nicht gefunden")

    # Delete source file if exists
    if template.source_pptx_path:
        p = Path(template.source_pptx_path)
        if p.exists():
            p.unlink()

    await db.delete(template)
    await db.commit()
    return {"detail": "Template geloescht"}
