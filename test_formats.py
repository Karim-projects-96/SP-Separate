import io
import json
import urllib.request
from PIL import Image
import pymupdf

BASE = 'http://127.0.0.1:8000'

def upload(data, filename):
    boundary = '----BoundaryUploadTest'
    body = bytearray()
    body.extend(f'--{boundary}\r\n'.encode())
    body.extend(f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode())
    body.extend(b'Content-Type: application/octet-stream\r\n\r\n')
    body.extend(data)
    body.extend(f'\r\n--{boundary}--\r\n'.encode())
    req = urllib.request.Request(f'{BASE}/api/upload', data=body, headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode())

def run():
    print("Testing document format versatility...")
    
    # 1. Test RGBA PNG
    im_rgba = Image.new('RGBA', (600, 800), (255, 255, 255, 0))
    buf = io.BytesIO()
    im_rgba.save(buf, format='PNG')
    r1 = upload(buf.getvalue(), 'transparent_form.png')
    print('[PASS] RGBA PNG Upload:', r1['doc_id'], r1['image_size'])

    # 2. Test File without extension
    im_rgb = Image.new('RGB', (800, 1000), (240, 240, 240))
    buf2 = io.BytesIO()
    im_rgb.save(buf2, format='JPEG')
    r2 = upload(buf2.getvalue(), 'form_no_extension')
    print('[PASS] No Extension Upload:', r2['doc_id'], r2['image_size'])

    # 3. Test Scanned 1-bit / Grayscale
    im_gray = Image.new('L', (700, 900), 200)
    buf3 = io.BytesIO()
    im_gray.save(buf3, format='PNG')
    r3 = upload(buf3.getvalue(), 'scanned_grayscale.png')
    print('[PASS] Grayscale Scanned Upload:', r3['doc_id'], r3['image_size'])

    # 4. Test PDF without .pdf in filename
    doc = pymupdf.open()
    doc.new_page(width=595, height=842)
    pdf_bytes = doc.tobytes()
    doc.close()
    r4 = upload(pdf_bytes, 'candidate_application_form_blob')
    print('[PASS] PDF Magic Bytes Upload (no .pdf extension):', r4['doc_id'], f"{r4['total_pages']} page(s)")

    print("\nAll format versatility tests PASSED successfully!")

if __name__ == '__main__':
    run()
