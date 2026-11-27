"""Package the Outline page and translation worker as one deployable HTML file."""
import base64
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
revision = sys.argv[1]
if not re.fullmatch(r"[0-9a-f]{40}", revision):
    raise SystemExit("Expected a full Git commit SHA")

page = root / "outline.html"
source = page.read_text(encoding="utf-8")
worker = base64.b64encode((root / "outline-translation-worker.js").read_bytes()).decode("ascii")
for old, new in (
    ("const OUTLINE_BUILD='local';", f"const OUTLINE_BUILD='{revision}';"),
    ("const OUTLINE_WORKER_BASE64='';", f"const OUTLINE_WORKER_BASE64='{worker}';"),
):
    if source.count(old) != 1:
        raise SystemExit(f"Expected one release marker: {old}")
    source = source.replace(old, new)
page.write_text(source, encoding="utf-8")
