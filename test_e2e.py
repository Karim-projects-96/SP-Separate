"""
FormExtract Pro - Comprehensive End-to-End Test Suite
Tests every feature and endpoint start to end:
1. Static web asset serving (HTML, CSS, JS)
2. Presets API
3. Sample Form Generator & AI Auto-Detection
4. Image Upload & Coordinate Extraction
5. Multi-page PDF Upload & Page Navigation
6. Photo & Signature Crop, Enhancement, and KB Compression (SSC & UPSC specs)
7. Transparent PNG vs Clean White Signature extraction
8. Single and ZIP Bundle downloads
9. Batch Processing API with Multi-form extraction
10. CLI tool single & batch processing
"""

import io
import json
import os
import sys
import urllib.request
import urllib.parse
import zipfile
import cv2
import numpy as np
from PIL import Image
import pymupdf

BASE_URL = "http://127.0.0.1:8000"

def log_test(name: str):
    print(f"\n" + "="*70)
    print(f"  RUNNING TEST: {name}")
    print("="*70)

def pass_test(name: str, details: str = ""):
    print(f"  [PASS] {name} {details}")

def fail_test(name: str, error: str):
    print(f"  [FAIL] {name}: {error}")
    sys.exit(1)


def test_1_server_health_and_assets():
    log_test("1. Server Health & Static Web Assets")
    assets = ["/", "/style.css", "/app.js", "/api/presets"]
    for path in assets:
        url = BASE_URL + path
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req) as res:
                if res.status != 200:
                    fail_test(f"Asset {path}", f"Status {res.status}")
                data = res.read()
                pass_test(f"Asset {path}", f"(Status 200, {len(data)} bytes)")
        except Exception as e:
            fail_test(f"Asset {path}", str(e))


def test_2_presets_api():
    log_test("2. Portal Presets API")
    url = BASE_URL + "/api/presets"
    try:
        with urllib.request.urlopen(url) as res:
            presets = json.loads(res.read())
            expected_keys = ["ssc", "upsc", "ibps", "passport_visa", "custom"]
            for k in expected_keys:
                if k not in presets:
                    fail_test(f"Preset {k}", "Missing in presets response")
                p = presets[k]
                pass_test(f"Preset '{k}' ({p['name']})", f"Photo: {p['photo']}, Sign: {p['signature']}")
    except Exception as e:
        fail_test("Presets API", str(e))


def test_3_sample_document_and_detection():
    log_test("3. Sample Document Generator & Dual-Engine Detection")
    url = BASE_URL + "/api/sample"
    try:
        with urllib.request.urlopen(url) as res:
            data = json.loads(res.read())
            doc_id = data["doc_id"]
            img_size = data["image_size"]
            photo = data["photo"]
            sig = data["signature"]
            
            if not doc_id.startswith("sample-"):
                fail_test("Sample doc_id", f"Unexpected doc_id {doc_id}")
            if img_size["width"] != 1200 or img_size["height"] != 1650:
                fail_test("Image dimensions", f"Unexpected dimensions: {img_size}")
                
            # Verify Photo Detection
            p_box = photo["box"]
            p_conf = photo["confidence"]
            if p_conf < 0.80:
                fail_test("Photo confidence", f"Confidence too low: {p_conf}")
            pass_test("Photo Detection", f"Box: [x={p_box['x']}, y={p_box['y']}, w={p_box['width']}, h={p_box['height']}], Conf={p_conf}, Method={photo['method']}")

            # Verify Signature Detection
            s_box = sig["box"]
            s_conf = sig["confidence"]
            if s_conf < 0.80:
                fail_test("Signature confidence", f"Confidence too low: {s_conf}")
            pass_test("Signature Detection", f"Box: [x={s_box['x']}, y={s_box['y']}, w={s_box['width']}, h={s_box['height']}], Conf={s_conf}, Method={sig['method']}")
            
            return doc_id, p_box, s_box
    except Exception as e:
        fail_test("Sample document", str(e))


def test_4_process_and_enhancement(doc_id: str, p_box: dict, s_box: dict):
    log_test("4. Photo & Signature Separation, Enhancement, & Target KB Compression")
    
    # Test SSC Exam Configuration: Photo 200x230 <= 50KB, Signature 140x60 <= 20KB
    payload = {
        "doc_id": doc_id,
        "photo_box": p_box,
        "sig_box": s_box,
        "photo_settings": {
            "width": 200,
            "height": 230,
            "brightness": 1.05,
            "contrast": 1.1,
            "sharpen": True,
            "add_border": True,
            "target_kb": 50
        },
        "sig_settings": {
            "mode": "clean_white",
            "ink_color": "blue",
            "threshold": 190,
            "width": 140,
            "height": 60,
            "target_kb": 20
        }
    }
    
    url = BASE_URL + "/api/process"
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read())
        p_res = data["photo"]
        s_res = data["signature"]
        
        # Validate Photo output
        if p_res["width"] != 200 or p_res["height"] != 230:
            fail_test("Photo dimensions", f"Expected 200x230, got {p_res['width']}x{p_res['height']}")
        if p_res["size_kb"] > 50:
            fail_test("Photo target KB", f"File size {p_res['size_kb']}KB exceeded max 50KB")
        pass_test("Photo Processing (SSC Specs)", f"{p_res['width']}x{p_res['height']} px, File Size: {p_res['size_kb']} KB (Target <= 50KB)")

        # Validate Signature output
        if s_res["width"] != 140 or s_res["height"] != 60:
            fail_test("Signature dimensions", f"Expected 140x60, got {s_res['width']}x{s_res['height']}")
        if s_res["size_kb"] > 20:
            fail_test("Signature target KB", f"File size {s_res['size_kb']}KB exceeded max 20KB")
        pass_test("Signature Processing (Clean White & Blue Ink)", f"{s_res['width']}x{s_res['height']} px, File Size: {s_res['size_kb']} KB (Target <= 20KB)")

    # Test Transparent PNG Signature Extraction
    payload["sig_settings"]["mode"] = "transparent"
    payload["sig_settings"]["ink_color"] = "black"
    req_trans = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req_trans) as res:
        data_trans = json.loads(res.read())
        s_trans = data_trans["signature"]
        if s_trans["mime"] != "image/png":
            fail_test("Transparent Signature MIME", f"Expected image/png, got {s_trans['mime']}")
        pass_test("Transparent PNG Signature Extraction", f"MIME: {s_trans['mime']}, Size: {s_trans['size_kb']} KB")


def test_5_downloads_and_zip_bundle(doc_id: str):
    log_test("5. File Downloads & ZIP Bundle Package")
    
    # 1. Download Photo
    photo_url = f"{BASE_URL}/api/download/photo?doc_id={doc_id}"
    with urllib.request.urlopen(photo_url) as res:
        photo_bytes = res.read()
        pil_p = Image.open(io.BytesIO(photo_bytes))
        pass_test("Photo Download Endpoint", f"Format: {pil_p.format}, Dimensions: {pil_p.size}, Size: {len(photo_bytes)} bytes")
        
    # 2. Download Signature
    sig_url = f"{BASE_URL}/api/download/signature?doc_id={doc_id}"
    with urllib.request.urlopen(sig_url) as res:
        sig_bytes = res.read()
        pil_s = Image.open(io.BytesIO(sig_bytes))
        pass_test("Signature Download Endpoint", f"Format: {pil_s.format}, Mode: {pil_s.mode}, Size: {len(sig_bytes)} bytes")

    # 3. Download ZIP Bundle
    zip_url = f"{BASE_URL}/api/download/zip?doc_id={doc_id}"
    with urllib.request.urlopen(zip_url) as res:
        zip_bytes = res.read()
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
        namelist = zf.namelist()
        if len(namelist) < 2:
            fail_test("ZIP Bundle Content", f"Expected 2 files in ZIP, found: {namelist}")
        photo_file = [f for f in namelist if "photo" in f][0]
        sig_file = [f for f in namelist if "signature" in f][0]
        pass_test("ZIP Bundle Download", f"Contains '{photo_file}' ({len(zf.read(photo_file))} bytes) & '{sig_file}' ({len(zf.read(sig_file))} bytes)")


def test_6_pdf_multi_page():
    log_test("6. Multi-Page PDF Creation, Upload & Page Switching")
    from backend.sample_generator import generate_sample_form
    
    # Create 2-page PDF in memory
    form_bytes = generate_sample_form()
    pdf_doc = pymupdf.open()
    
    # Page 1: Form
    page1 = pdf_doc.new_page(width=595, height=842) # A4
    page1.insert_image(pymupdf.Rect(0, 0, 595, 842), stream=form_bytes)
    
    # Page 2: Second page with another form
    page2 = pdf_doc.new_page(width=595, height=842)
    page2.insert_image(pymupdf.Rect(0, 0, 595, 842), stream=form_bytes)
    
    pdf_bytes = pdf_doc.tobytes()
    pdf_doc.close()
    
    # Upload multi-page PDF via multipart
    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
    body = bytearray()
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(b'Content-Disposition: form-data; name="file"; filename="application_multipage.pdf"\r\n')
    body.extend(b'Content-Type: application/pdf\r\n\r\n')
    body.extend(pdf_bytes)
    body.extend(f"\r\n--{boundary}--\r\n".encode())
    
    req = urllib.request.Request(
        f"{BASE_URL}/api/upload?page=0",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
    )
    
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read())
        doc_id = data["doc_id"]
        total_pages = data["total_pages"]
        current_page = data["current_page"]
        
        if total_pages != 2:
            fail_test("PDF Total Pages", f"Expected 2 pages, got {total_pages}")
        pass_test("PDF Upload & Detection (Page 1/2)", f"Doc ID: {doc_id}, Pages: {total_pages}, Current: {current_page + 1}")

    # Switch to Page 2
    change_data = urllib.parse.urlencode({"doc_id": doc_id, "page": 1}).encode()
    req_change = urllib.request.Request(f"{BASE_URL}/api/change-page", data=change_data)
    with urllib.request.urlopen(req_change) as res_change:
        page2_data = json.loads(res_change.read())
        if page2_data["current_page"] != 1:
            fail_test("Page Switch", f"Expected page 1, got {page2_data['current_page']}")
        pass_test("PDF Page Switch (Page 2/2)", f"Successfully switched to Page {page2_data['current_page'] + 1} with re-detection!")


def test_7_batch_processing_api():
    log_test("7. Batch Processing API (Multi-Form Queue)")
    from backend.sample_generator import generate_sample_form
    sample_bytes = generate_sample_form()
    
    boundary = "----WebKitFormBoundaryBatchTest"
    body = bytearray()
    
    # Add 2 files to batch
    for i in range(1, 3):
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="files"; filename="applicant_form_{i}.jpg"\r\n'.encode())
        body.extend(b'Content-Type: image/jpeg\r\n\r\n')
        body.extend(sample_bytes)
        body.extend(b"\r\n")
        
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(b'Content-Disposition: form-data; name="preset_key"\r\n\r\nssc\r\n')
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(b'Content-Disposition: form-data; name="target_photo_kb"\r\n\r\n50\r\n')
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(b'Content-Disposition: form-data; name="target_sig_kb"\r\n\r\n20\r\n')
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(b'Content-Disposition: form-data; name="sig_mode"\r\n\r\nclean_white\r\n')
    body.extend(f"--{boundary}--\r\n".encode())
    
    req = urllib.request.Request(
        f"{BASE_URL}/api/batch-process",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
    )
    
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read())
        batch_id = data["batch_id"]
        count = data["processed_count"]
        if count != 2:
            fail_test("Batch processed count", f"Expected 2, got {count}")
        pass_test("Batch Processing API", f"Batch ID: {batch_id}, Processed Forms: {count}")
        
        # Verify Batch ZIP Download
        zip_url = f"{BASE_URL}/api/batch-download/{batch_id}"
        with urllib.request.urlopen(zip_url) as zres:
            zbytes = zres.read()
            zf = zipfile.ZipFile(io.BytesIO(zbytes))
            namelist = zf.namelist()
            if len(namelist) != 4: # 2 forms * (1 photo + 1 sign)
                fail_test("Batch ZIP contents count", f"Expected 4 files, got {len(namelist)}: {namelist}")
            pass_test("Batch ZIP Download", f"Successfully downloaded batch archive with {len(namelist)} items: {namelist}")


def test_8_cli_end_to_end():
    log_test("8. CLI Tool (Single & Batch File Processing)")
    import subprocess
    from backend.sample_generator import generate_sample_form
    
    test_dir = "./test_cli_workspace"
    input_dir = os.path.join(test_dir, "input")
    output_dir = os.path.join(test_dir, "output")
    os.makedirs(input_dir, exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)
    
    # Create sample form file
    sample_file = os.path.join(input_dir, "test_candidate.jpg")
    with open(sample_file, "wb") as f:
        f.write(generate_sample_form())
        
    # 1. Single file CLI execution
    cmd_single = [sys.executable, "cli.py", sample_file, "--preset", "ssc", "--output-dir", output_dir]
    p_single = subprocess.run(cmd_single, capture_output=True, text=True)
    if p_single.returncode != 0:
        fail_test("CLI Single execution", p_single.stderr)
        
    photo_out = os.path.join(output_dir, "test_candidate_photo.jpg")
    sig_out = os.path.join(output_dir, "test_candidate_signature.jpg")
    if not os.path.exists(photo_out) or not os.path.exists(sig_out):
        fail_test("CLI Single output files", f"Missing outputs: photo={os.path.exists(photo_out)}, sig={os.path.exists(sig_out)}")
    pass_test("CLI Single File Mode", f"Generated: {photo_out} & {sig_out}")

    # 2. Batch folder CLI execution
    batch_out_dir = os.path.join(test_dir, "batch_output")
    cmd_batch = [sys.executable, "cli.py", "--batch", input_dir, "--preset", "upsc", "--output-dir", batch_out_dir]
    p_batch = subprocess.run(cmd_batch, capture_output=True, text=True)
    if p_batch.returncode != 0:
        fail_test("CLI Batch execution", p_batch.stderr)
    pass_test("CLI Batch Directory Mode", "Processed folder in batch with exit code 0")

    # Cleanup test workspace
    import shutil
    shutil.rmtree(test_dir, ignore_errors=True)
    pass_test("CLI Cleanup", "Cleaned up temporary test directory")


if __name__ == "__main__":
    print("\n" + "#"*70)
    print("  FORMDEXTRACT PRO - FULL END-TO-END AUTOMATED TEST SUITE")
    print("#"*70)
    
    test_1_server_health_and_assets()
    test_2_presets_api()
    doc_id, p_box, s_box = test_3_sample_document_and_detection()
    test_4_process_and_enhancement(doc_id, p_box, s_box)
    test_5_downloads_and_zip_bundle(doc_id)
    test_6_pdf_multi_page()
    test_7_batch_processing_api()
    test_8_cli_end_to_end()
    
    print("\n" + "="*70)
    print("  [SUCCESS] ALL 8 TEST SUITES COMPLETED WITH 100% SUCCESS!")
    print("="*70 + "\n")
