import os
import zipfile
from pathlib import Path

from fastapi import UploadFile, HTTPException


DANGEROUS_EXTENSIONS = {".exe", ".dll", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".scr"}
MAX_PATH_LENGTH = 260


class SanitizeError(Exception):
    pass


async def sanitize_upload(
    file: UploadFile,
    dest_path: Path,
    max_size_mb: int = 100,
    max_decompress_ratio: int = 100,
    max_zip_entries: int = 5000,
) -> Path:
    """Validate and save an uploaded PPTX file securely."""

    # 1. Check file extension
    filename = file.filename or "unknown.pptx"
    ext = Path(filename).suffix.lower()
    if ext not in (".pptx",):
        raise HTTPException(
            status_code=400,
            detail=f"Nur PPTX-Dateien erlaubt. Erhalten: {ext}",
        )

    # 2. Read file content and check size
    content = await file.read()
    file_size = len(content)
    max_bytes = max_size_mb * 1024 * 1024

    if file_size > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"Datei zu groß: {file_size / 1024 / 1024:.1f}MB (max {max_size_mb}MB)",
        )

    if file_size == 0:
        raise HTTPException(status_code=400, detail="Leere Datei")

    # 3. Save to temp location for ZIP inspection
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    dest_path.write_bytes(content)

    try:
        _validate_zip(dest_path, file_size, max_decompress_ratio, max_zip_entries)
    except SanitizeError as e:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(e))

    return dest_path


def _validate_zip(
    path: Path,
    compressed_size: int,
    max_ratio: int,
    max_entries: int,
):
    """Validate ZIP structure for security threats."""

    # Check it's a valid ZIP
    if not zipfile.is_zipfile(path):
        raise SanitizeError("Datei ist kein gültiges PPTX/ZIP-Archiv")

    with zipfile.ZipFile(path, "r") as zf:
        entries = zf.infolist()

        # Check entry count (DoS prevention)
        if len(entries) > max_entries:
            raise SanitizeError(
                f"Zu viele Einträge im Archiv: {len(entries)} (max {max_entries})"
            )

        total_uncompressed = 0
        for entry in entries:
            # Path traversal check
            entry_path = entry.filename
            if entry_path.startswith("/") or ".." in entry_path:
                raise SanitizeError(
                    f"Verdächtiger Pfad im Archiv: {entry_path}"
                )

            if len(entry_path) > MAX_PATH_LENGTH:
                raise SanitizeError(f"Pfad zu lang: {entry_path[:50]}...")

            # Check for macros (PPTM disguised as PPTX)
            if entry_path.lower() in ("ppt/vbaproject.bin", "vbaproject.bin"):
                raise SanitizeError(
                    "Datei enthält Makros (VBA). Bitte als PPTX ohne Makros speichern."
                )

            # Check for dangerous embedded files
            entry_ext = Path(entry_path).suffix.lower()
            if entry_ext in DANGEROUS_EXTENSIONS:
                raise SanitizeError(
                    f"Gefährlicher Dateityp im Archiv: {entry_path}"
                )

            total_uncompressed += entry.file_size

        # Zip bomb check
        if compressed_size > 0:
            ratio = total_uncompressed / compressed_size
            if ratio > max_ratio:
                raise SanitizeError(
                    f"Verdächtige Kompressionsrate: {ratio:.0f}:1 (max {max_ratio}:1). "
                    "Mögliche Zip-Bomb."
                )
