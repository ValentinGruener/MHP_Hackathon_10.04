from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models import PresentationStatus, Severity, CheckEngine, CorrectionStatus


# --- Template ---

class TemplateRules(BaseModel):
    allowed_fonts: list[str] = []
    allowed_font_sizes: list[float] = []
    color_palette: list[str] = []  # hex colors
    logo_position: Optional[dict] = None  # {x, y, w, h}
    logo_image_hash: Optional[str] = None
    margins: Optional[dict] = None  # {left, right, top, bottom}
    slide_layouts: list[str] = []


class TemplateCreate(BaseModel):
    name: str
    department: Optional[str] = None


class TemplateResponse(BaseModel):
    id: int
    name: str
    department: Optional[str]
    rules: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class TemplateRulesUpdate(BaseModel):
    allowed_fonts: Optional[list[str]] = None
    allowed_font_sizes: Optional[list[float]] = None
    color_palette: Optional[list[str]] = None
    logo_position: Optional[dict] = None
    margins: Optional[dict] = None


# --- Presentation ---

class PresentationResponse(BaseModel):
    id: int
    template_id: Optional[int]
    filename: str
    status: PresentationStatus
    score: Optional[float]
    coverage_percent: Optional[float]
    slide_count: Optional[int]
    uploaded_at: datetime

    model_config = {"from_attributes": True}


# --- CheckResult ---

class CheckResultResponse(BaseModel):
    id: int
    slide_number: int
    engine: CheckEngine
    error_type: str
    severity: Severity
    element_id: Optional[str]
    position_x: Optional[float]
    position_y: Optional[float]
    position_w: Optional[float]
    position_h: Optional[float]
    description: str
    suggestion: Optional[str]
    auto_fixable: bool
    current_value: Optional[str]
    expected_value: Optional[str]

    model_config = {"from_attributes": True}


class PresentationDetailResponse(PresentationResponse):
    check_results: list[CheckResultResponse] = []
    error_counts: Optional[dict] = None


# --- Correction ---

class CorrectionRequest(BaseModel):
    check_result_ids: list[int]


class CorrectionResponse(BaseModel):
    id: int
    check_result_id: int
    before_value: Optional[str]
    after_value: Optional[str]
    status: CorrectionStatus

    model_config = {"from_attributes": True}


# --- SSE Events ---

class CheckProgressEvent(BaseModel):
    engine: str
    status: str  # "started", "completed", "error"
    slide_number: Optional[int] = None
    total_slides: Optional[int] = None
    errors_found: Optional[int] = None
    message: Optional[str] = None
