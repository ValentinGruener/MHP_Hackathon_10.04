"""Convert a ci_guidelines.yaml (schema v1.0) into the CD rules dict used by the rules engine."""
import yaml


def yaml_to_cd_rules(yaml_bytes: bytes) -> dict:
    """Parse a YAML guidelines file and return a CD rules dict."""
    data = yaml.safe_load(yaml_bytes)
    branding = data.get("branding", {})
    structure = data.get("structure", {}).get("pptx", {})
    content = data.get("content", {})

    # ── Colors ────────────────────────────────────────────────────────────────
    colors_cfg = branding.get("colors", {})
    color_palette = []
    for key, val in colors_cfg.items():
        if key in ("forbidden_colors", "tolerance"):
            continue
        if isinstance(val, str) and val.startswith("#"):
            color_palette.append(val.lstrip("#").upper())
    color_tolerance = colors_cfg.get("tolerance", 5)

    # ── Fonts ─────────────────────────────────────────────────────────────────
    fonts_cfg = branding.get("fonts", {})
    allowed_fonts: set[str] = set()
    title_size: dict = {}
    body_size: dict = {}

    for category, fdata in fonts_cfg.items():
        if category == "forbidden_fonts" or not isinstance(fdata, dict):
            continue
        for f in fdata.get("allowed", []):
            allowed_fonts.add(f)
        if category == "headings":
            mn, mx = fdata.get("size_min"), fdata.get("size_max")
            if mn and mx:
                title_size = {"min": mn, "max": mx}
        elif category == "body":
            mn, mx = fdata.get("size_min"), fdata.get("size_max")
            if mn and mx:
                body_size = {"min": mn, "max": mx}

    # ── Logo ──────────────────────────────────────────────────────────────────
    logo_cfg = branding.get("logo", {})
    logo_required_on = ["first", "last"] if logo_cfg.get("required") else []

    # ── Required slides ───────────────────────────────────────────────────────
    required_slides = []
    for rs in structure.get("required_slides", []):
        pos = rs.get("position")
        if pos == "first":
            mapped_pos = 1
        elif pos == "last":
            mapped_pos = "last"
        elif isinstance(pos, int):
            mapped_pos = pos
        else:
            continue
        required_slides.append({"type": rs.get("type", "unknown"), "position": mapped_pos})

    # ── Slide limits ──────────────────────────────────────────────────────────
    limits_cfg = structure.get("slide_limits", {})
    slide_limits: dict = {}
    if limits_cfg.get("total_min"):
        slide_limits["min"] = limits_cfg["total_min"]
    if limits_cfg.get("total_max"):
        slide_limits["max"] = limits_cfg["total_max"]

    # ── Forbidden phrases for the Haiku engine ────────────────────────────────
    forbidden_phrases = content.get("forbidden_phrases", {})

    return {
        "allowed_fonts": sorted(allowed_fonts),
        "allowed_font_sizes": [],
        "color_palette": sorted(color_palette),
        "color_tolerance": color_tolerance,
        "title_size": title_size,
        "body_size": body_size,
        "logo_required_on": logo_required_on,
        "required_slides": required_slides,
        "slide_limits": slide_limits,
        "severity_weights": {"critical": 5, "warning": 2, "info": 0},
        "forbidden_phrases": forbidden_phrases,
        "logo_position": None,
        "slide_layouts": [],
        "_source": "yaml",
    }
