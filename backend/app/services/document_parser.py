"""
Document parser — extracts structured text from PDF and DOCX files.

Tables are rendered as GitHub-flavored markdown so that row/column relationships
are preserved for the LLM. DOCX headings are emitted as Markdown headings (#, ##, ###)
to enable semantic section splitting for large-document chunking.

Public API
----------
extract_text(filepath)   -> str   full structured text (tables as markdown)
extract_sections(text)   -> list[str]   semantic chunks split at heading boundaries
"""

import re
from pathlib import Path


def extract_text(filepath: str) -> str:
    """
    Extract structured text from a PDF or DOCX file.

    Tables are formatted as Markdown.  DOCX headings produce # markers.
    PDF pages are separated by --- dividers.

    Raises FileNotFoundError if the file does not exist.
    Raises ValueError for unsupported file types.
    """
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {filepath}")

    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return _extract_pdf(str(path))
    elif suffix in (".docx", ".doc"):
        return _extract_docx(str(path))
    else:
        raise ValueError(f"Unsupported file type: {suffix}. Only PDF and DOCX are supported.")


def extract_sections(text: str) -> list[str]:
    """
    Split structured text into semantic sections at Markdown heading boundaries.

    Returns a list of non-empty section strings.  If the text contains no
    headings the entire text is returned as a single-element list.
    """
    # Split just before any line that starts with one or more # characters
    parts = re.split(r"(?=\n#{1,6} )", text)
    sections = [p.strip() for p in parts if p.strip()]
    return sections if sections else [text]


# ── DOCX ──────────────────────────────────────────────────────────────────────

def _extract_docx(filepath: str) -> str:
    """Pure XML traversal — avoids python-docx OO wrappers that require a `.part`
    attribute on the parent, which `CT_Body` (doc.element.body) does not have.

    Handles:
    - w:p (paragraphs): detects heading styles by w:pStyle val; emits # markers
    - w:tbl (tables): renders as GFM markdown tables
    - Nested tables inside table cells are rendered recursively
    - w:sdt (structured document tags / content controls): text is extracted
    """
    from docx import Document
    from docx.oxml.ns import qn

    _W_P   = qn("w:p")
    _W_TBL = qn("w:tbl")
    _W_SDT = qn("w:sdt")
    _W_PPR = qn("w:pPr")
    _W_PST = qn("w:pStyle")
    _W_VAL = qn("w:val")
    _W_T   = qn("w:t")
    _W_TR  = qn("w:tr")
    _W_TC  = qn("w:tc")

    def _elem_text(elem) -> str:
        """Concatenate all w:t text nodes under elem."""
        return "".join((node.text or "") for node in elem.iter(_W_T))

    def _para_style_id(p_elem) -> str:
        """Return the w:pStyle val for a w:p element, or '' if none."""
        pPr = p_elem.find(_W_PPR)
        if pPr is None:
            return ""
        pSt = pPr.find(_W_PST)
        return pSt.get(_W_VAL, "") if pSt is not None else ""

    def _is_heading(style_id: str) -> tuple[bool, int]:
        """Return (True, level) if style_id is a Heading style, else (False, 0)."""
        m = re.match(r"[Hh]eading\s*(\d+)", style_id)
        if m:
            return True, min(int(m.group(1)), 6)
        return False, 0

    def _render_table(tbl_elem) -> str:
        """Render a w:tbl element as a GFM markdown table.

        Cells may themselves contain nested tables; those are rendered inline
        as a compact pipe-separated row rather than recursive GFM tables to
        keep the outer table parseable.
        """
        rows: list[str] = []
        for i, tr in enumerate(tbl_elem.iterchildren(_W_TR)):
            cells: list[str] = []
            for tc in tr.iterchildren(_W_TC):
                # Gather text from all paragraphs and nested tables in the cell
                cell_parts: list[str] = []
                for cell_child in tc.iterchildren():
                    if cell_child.tag == _W_P:
                        t = _elem_text(cell_child).strip()
                        if t:
                            cell_parts.append(t)
                    elif cell_child.tag == _W_TBL:
                        # Flatten nested table as "r1c1, r1c2 / r2c1, r2c2"
                        nested_rows = []
                        for nested_tr in cell_child.iterchildren(_W_TR):
                            nested_cells = [
                                _elem_text(ntc).strip()
                                for ntc in nested_tr.iterchildren(_W_TC)
                            ]
                            nested_rows.append(", ".join(nested_cells))
                        cell_parts.append(" / ".join(nested_rows))
                cell_text = " ".join(cell_parts).replace("\n", " ")
                cells.append(cell_text)
            if cells:
                rows.append("| " + " | ".join(cells) + " |")
                if i == 0:
                    rows.append("| " + " | ".join(["---"] * len(cells)) + " |")
        return "\n".join(rows)

    def _process_children(container_elem) -> list[str]:
        """Walk direct children of a block container, returning text parts."""
        result: list[str] = []
        for child in container_elem.iterchildren():
            tag = child.tag
            if tag == _W_P:
                text = _elem_text(child).strip()
                if not text:
                    continue
                style_id = _para_style_id(child)
                is_hdg, level = _is_heading(style_id)
                if is_hdg:
                    result.append(f"\n{'#' * level} {text}")
                else:
                    result.append(text)
            elif tag == _W_TBL:
                rendered = _render_table(child)
                if rendered:
                    result.append(rendered)
            elif tag == _W_SDT:
                # Structured document tag — recurse into w:sdtContent child
                sdt_content = child.find(qn("w:sdtContent"))
                if sdt_content is not None:
                    result.extend(_process_children(sdt_content))
        return result

    doc = Document(filepath)
    parts = _process_children(doc.element.body)
    return "\n\n".join(parts)


# ── PDF ───────────────────────────────────────────────────────────────────────

def _extract_pdf(filepath: str) -> str:
    import pdfplumber

    pages: list[str] = []

    with pdfplumber.open(filepath) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            parts: list[str] = []

            # Locate table bounding boxes on this page
            page_tables = page.find_tables()
            table_bboxes = [t.bbox for t in page_tables]

            # Extract prose text, filtering out characters that fall inside tables
            # so they are not duplicated in the markdown table below
            if table_bboxes:
                def _not_in_any_table(obj: dict) -> bool:
                    x0 = obj.get("x0", 0)
                    top = obj.get("top", 0)
                    x1 = obj.get("x1", 0)
                    bottom = obj.get("bottom", 0)
                    for bbox in table_bboxes:
                        if (
                            x0 >= bbox[0] - 2
                            and top >= bbox[1] - 2
                            and x1 <= bbox[2] + 2
                            and bottom <= bbox[3] + 2
                        ):
                            return False
                    return True

                prose_text = page.filter(_not_in_any_table).extract_text()
            else:
                prose_text = page.extract_text()

            if prose_text and prose_text.strip():
                parts.append(prose_text.strip())

            # Append each table as markdown
            for t in page_tables:
                data = t.extract()
                if data:
                    formatted = _format_raw_table_as_markdown(data)
                    if formatted:
                        parts.append(formatted)

            if parts:
                pages.append(f"<!-- page {page_num} -->\n" + "\n\n".join(parts))

    return "\n\n---\n\n".join(pages)


def _format_raw_table_as_markdown(data: list[list]) -> str:
    """Render pdfplumber table data (list of rows) as a markdown table string."""
    rows: list[str] = []
    for i, row in enumerate(data):
        cells = [str(cell or "").strip().replace("\n", " ") for cell in row]
        rows.append("| " + " | ".join(cells) + " |")
        if i == 0:
            rows.append("| " + " | ".join(["---"] * len(cells)) + " |")
    return "\n".join(rows)
