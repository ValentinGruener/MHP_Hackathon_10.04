"""
pdf_parser.py — Extract text and render pages as images from PDF files using PyMuPDF.
"""

import base64
from pathlib import Path

import fitz  # pymupdf


def parse_pdf(pdf_path: str | Path, dpi: int = 200) -> dict:
    """Parse a PDF file, extracting text and rendering each page as a base64 PNG.

    Returns:
        {
            "num_pages": int,
            "pages": [
                {
                    "page_number": 1,
                    "text": "...",
                    "image_base64": "iVBOR...",  # base64-encoded PNG
                    "width": 1654,
                    "height": 2339,
                }
            ],
            "full_text": "all text concatenated",
        }
    """
    doc = fitz.open(str(pdf_path))
    pages = []
    full_text_parts = []

    zoom = dpi / 72  # 72 is default PDF resolution
    matrix = fitz.Matrix(zoom, zoom)

    for page_num in range(len(doc)):
        page = doc[page_num]

        # Extract text
        text = page.get_text("text")
        full_text_parts.append(text)

        # Render page as PNG image
        pixmap = page.get_pixmap(matrix=matrix)
        png_bytes = pixmap.tobytes("png")
        image_base64 = base64.b64encode(png_bytes).decode("ascii")

        pages.append({
            "page_number": page_num + 1,
            "text": text.strip(),
            "image_base64": image_base64,
            "width": pixmap.width,
            "height": pixmap.height,
        })

    doc.close()

    return {
        "num_pages": len(pages),
        "pages": pages,
        "full_text": "\n\n".join(full_text_parts),
    }
