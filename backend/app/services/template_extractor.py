import hashlib
from pathlib import Path

from pptx import Presentation
from pptx.util import Emu, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN


def extract_cd_rules(pptx_path: Path) -> dict:
    """Extract Corporate Design rules from a master PPTX template."""
    prs = Presentation(str(pptx_path))

    fonts = set()
    font_sizes = set()
    colors = set()
    layouts = []

    # Extract from slide masters and layouts
    for slide_master in prs.slide_masters:
        _extract_from_shapes(slide_master.shapes, fonts, font_sizes, colors)

        for layout in slide_master.slide_layouts:
            layouts.append(layout.name)
            _extract_from_shapes(layout.placeholders, fonts, font_sizes, colors)

    # Extract from actual slides (sample content)
    for slide in prs.slides:
        _extract_from_shapes(slide.shapes, fonts, font_sizes, colors)

    # Extract theme colors
    theme_colors = _extract_theme_colors(prs)
    colors.update(theme_colors)

    # Detect logo (largest image on first slide or master)
    logo_spec = _detect_logo(prs)

    rules = {
        "allowed_fonts": sorted(fonts),
        "allowed_font_sizes": sorted(font_sizes),
        "color_palette": sorted(colors),
        "logo_position": logo_spec,
        "slide_layouts": layouts,
        "slide_width": prs.slide_width,
        "slide_height": prs.slide_height,
    }

    return rules


def _extract_from_shapes(shapes, fonts: set, font_sizes: set, colors: set):
    """Extract font, size, and color information from shapes."""
    for shape in shapes:
        if not shape.has_text_frame:
            continue
        for paragraph in shape.text_frame.paragraphs:
            for run in paragraph.runs:
                font = run.font
                if font.name:
                    fonts.add(font.name)
                if font.size:
                    fonts_pt = font.size.pt
                    font_sizes.add(fonts_pt)
                if font.color and font.color.rgb:
                    colors.add(str(font.color.rgb))


def _extract_theme_colors(prs: Presentation) -> set:
    """Extract colors from the presentation theme."""
    colors = set()
    try:
        theme = prs.slide_masters[0].element
        # Parse theme XML for color scheme
        nsmap = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
        for clr_elem in theme.iter("{http://schemas.openxmlformats.org/drawingml/2006/main}srgbClr"):
            val = clr_elem.get("val")
            if val:
                colors.add(val.upper())
    except (IndexError, AttributeError):
        pass
    return colors


def _detect_logo(prs: Presentation) -> dict | None:
    """Try to detect the logo image and its position."""
    # Check slide masters first, then first slide
    sources = list(prs.slide_masters)
    if prs.slides:
        sources.append(prs.slides[0])

    best_image = None
    for source in sources:
        for shape in source.shapes:
            if shape.shape_type == 13:  # Picture
                if best_image is None or (shape.width * shape.height < best_image["area"]):
                    # Prefer smaller images (logos tend to be smaller than full-page images)
                    best_image = {
                        "x": shape.left,
                        "y": shape.top,
                        "w": shape.width,
                        "h": shape.height,
                        "area": shape.width * shape.height,
                    }

    if best_image:
        best_image.pop("area")
        return best_image
    return None
