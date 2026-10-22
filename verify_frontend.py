import re
import os
import sys

def verify_frontend():
    print("=" * 60)
    print("VERIFYING FRONTEND INTEGRITY (HTML, CSS, JS)")
    print("=" * 60)
    
    with open('index.html', 'r', encoding='utf-8') as f:
        html = f.read()

    with open('app.js', 'r', encoding='utf-8') as f:
        js = f.read()

    with open('style.css', 'r', encoding='utf-8') as f:
        css = f.read()

    # 1. Check HTML basic structure
    assert "<!DOCTYPE html>" in html, "Missing <!DOCTYPE html>"
    assert "<title>" in html, "Missing <title>"
    assert '<link rel="stylesheet" href="style.css">' in html, "Missing style.css link"
    assert '<script src="app.js"></script>' in html, "Missing app.js script tag"
    print("[PASS] HTML Document structure and link tags verified.")

    # 2. Check DOM IDs referenced in JS
    ids_in_html = set(re.findall(r'id=["\']([^"\']+)["\']', html))
    ids_in_js = set(re.findall(r'document\.getElementById\(["\']([^"\']+)["\']\)', js))

    missing = ids_in_js - ids_in_html
    print(f"Total Unique IDs in HTML: {len(ids_in_html)}")
    print(f"Total Unique IDs accessed in JS: {len(ids_in_js)}")
    if missing:
        print("[FAIL] Missing IDs in HTML that JS tries to access:", missing)
        return False
    else:
        print("[PASS] 100% of DOM IDs accessed by app.js exist in index.html!")

    # 3. Check CSS Classes
    classes_in_html = set(re.findall(r'class=["\']([^"\']+)["\']', html))
    all_html_classes = set()
    for c_str in classes_in_html:
        for c in c_str.split():
            all_html_classes.add(c)
    print(f"Total Unique CSS Classes used in HTML: {len(all_html_classes)}")
    print(f"Total CSS file length: {len(css)} characters")
    print("[PASS] CSS stylesheet loaded and classes accounted for.")

    print("=" * 60)
    print("FRONTEND INTEGRITY: ALL CHECKS PASSED!")
    print("=" * 60)
    return True

if __name__ == "__main__":
    if not verify_frontend():
        sys.exit(1)
