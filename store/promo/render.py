# Render a promo HTML file to a PNG (RGB, no alpha) at an exact size.
# Usage: python3 store/promo/render.py <html> <png> <width> <height>
# Needs the Python package "playwright" and its Chromium.
import sys, pathlib
from playwright.sync_api import sync_playwright
src, out, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
with sync_playwright() as p:
    b = p.chromium.launch(args=["--allow-file-access-from-files"])
    pg = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
    pg.goto(pathlib.Path(src).resolve().as_uri()); pg.wait_for_timeout(300)
    pg.screenshot(path=out, type="png", omit_background=False)
    b.close()
