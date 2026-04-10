import enum
from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, JSON, Enum
from sqlalchemy.orm import relationship

from app.database import Base


class PresentationStatus(str, enum.Enum):
    uploading = "uploading"
    parsing = "parsing"
    checking = "checking"
    done = "done"
    error = "error"


class Severity(str, enum.Enum):
    critical = "critical"
    warning = "warning"
    info = "info"


class CheckEngine(str, enum.Enum):
    rules = "rules"
    languagetool = "languagetool"
    haiku = "haiku"


class CorrectionStatus(str, enum.Enum):
    pending = "pending"
    applied = "applied"
    failed = "failed"


class Template(Base):
    __tablename__ = "templates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    department = Column(String, nullable=True)
    source_pptx_path = Column(String, nullable=False)
    rules = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    presentations = relationship("Presentation", back_populates="template")


class Presentation(Base):
    __tablename__ = "presentations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=True)
    original_pptx_path = Column(String, nullable=False)
    corrected_pptx_path = Column(String, nullable=True)
    filename = Column(String, nullable=False)
    status = Column(Enum(PresentationStatus), default=PresentationStatus.uploading)
    score = Column(Float, nullable=True)
    coverage_percent = Column(Float, nullable=True)
    slide_count = Column(Integer, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    template = relationship("Template", back_populates="presentations")
    check_results = relationship("CheckResult", back_populates="presentation", cascade="all, delete-orphan")
    corrections = relationship("Correction", back_populates="presentation", cascade="all, delete-orphan")


class CheckResult(Base):
    __tablename__ = "check_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    presentation_id = Column(Integer, ForeignKey("presentations.id"), nullable=False)
    slide_number = Column(Integer, nullable=False)
    engine = Column(Enum(CheckEngine), nullable=False)
    error_type = Column(String, nullable=False)
    severity = Column(Enum(Severity), nullable=False)
    element_id = Column(String, nullable=True)
    position_x = Column(Float, nullable=True)
    position_y = Column(Float, nullable=True)
    position_w = Column(Float, nullable=True)
    position_h = Column(Float, nullable=True)
    description = Column(String, nullable=False)
    suggestion = Column(String, nullable=True)
    auto_fixable = Column(Boolean, default=False)
    current_value = Column(String, nullable=True)
    expected_value = Column(String, nullable=True)

    presentation = relationship("Presentation", back_populates="check_results")


class Correction(Base):
    __tablename__ = "corrections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    presentation_id = Column(Integer, ForeignKey("presentations.id"), nullable=False)
    check_result_id = Column(Integer, ForeignKey("check_results.id"), nullable=False)
    before_value = Column(String, nullable=True)
    after_value = Column(String, nullable=True)
    status = Column(Enum(CorrectionStatus), default=CorrectionStatus.pending)
    applied_at = Column(DateTime, nullable=True)

    presentation = relationship("Presentation", back_populates="corrections")
    check_result = relationship("CheckResult")
