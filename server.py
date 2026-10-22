"""
FormExtract Pro - High Performance FastAPI Backend Server
Provides REST APIs for document upload, auto-detection, interactive fine-tuning,
enhancement, batch processing, presets, and ZIP export.
"""

import base64
import io
import os
import uuid
import zipfile
from typing import Dict, Any, List, Optional
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.extractor import FormExtractor
from backend.sample_generator import generate_sample_form

app = FastAPI(title="FormExtract Pro API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory document session cache
# In production, this can use Redis or temp disk storage
DOC_STORE: Dict[str, Dict[str, Any]] = {}

extractor = FormExtractor()

# Standard Portal Presets
PRESETS = {
    "ssc": {
        "name": "SSC (Staff Selection Commission)",
        "photo": {"width": 200, "height": 230, "min_kb": 20, "max_kb": 50, "format": "jpg"},
        "signature": {"width": 140, "height": 60, "min_kb": 10, "max_kb": 20, "format": "jpg"}
    },
    "upsc": {
        "name": "UPSC (Union Public Service Commission)",
        "photo": {"width": 350, "height": 350, "min_kb": 20, "max_kb": 300, "format": "jpg"},
        "signature": {"width": 350, "height": 350, "min_kb": 20, "max_kb": 300, "format": "jpg"}
    },
    "ibps": {
        "name": "IBPS (Banking Examination)",
        "photo": {"width": 200, "height": 230, "min_kb": 20, "max_kb": 50, "format": "jpg"},
        "signature": {"width": 140, "height": 60, "min_kb": 10, "max_kb": 20, "format": "jpg"}
    },
    "passport_visa": {
        "name": "Passport / Visa Standard (2x2 inch)",
        "photo": {"width": 600, "height": 600, "min_kb": 50, "max_kb": 240, "format": "jpg"},
        "signature": {"width": 300, "height": 100, "min_kb": 20, "max_kb": 100, "format": "png"}
    },
    "custom": {
        "name": "Custom / Original Size",
        "photo": {"width": None, "height": None, "min_kb": None, "max_kb": 100, "format": "jpg"},
        "signature": {"width": None, "height": None, "min_kb": None, "max_kb": 50, "format": "png"}
    }
}


class BoxModel(BaseModel):
    x: float
    y: float
    width: float
    height: float


class ProcessRequest(BaseModel):
    doc_id: str
    photo_box: BoxModel
    sig_box: BoxModel
    photo_settings: Optional[Dict[str, Any]] = None
    sig_settings: Optional[Dict[str, Any]] = None


def img_to_base64_data_url(img_bytes: bytes, mime: str = "image/jpeg") -> str:
    encoded = base64.b64encode(img_bytes).decode("utf-8")
    return f"data:{mime};base64,{encoded}"


@app.get("/api/presets")
def get_presets():
    return PRESETS


@app.get("/api/sample")
def get_sample_document():
    """Generates and registers a sample application form for instant demo."""
    sample_bytes = generate_sample_form()
    doc_id = f"sample-{uuid.uuid4().hex[:8]}"
    
    img, total_pages = extractor.load_document(sample_bytes, "sample.jpg")
    detection = extractor.detect(img)
    
    # Store in memory
    DOC_STORE[doc_id] = {
        "img": img,
        "filename": "sample_application_form.jpg",
        "total_pages": total_pages,
        "current_page": 0,
        "detection": detection,
        "raw_bytes": sample_bytes
    }
    
    # Encode document preview to JPEG
    _, enc = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 88])
    doc_preview_url = img_to_base64_data_url(enc.tobytes(), "image/jpeg")
    
    return {
        "doc_id": doc_id,
        "filename": "sample_application_form.jpg",
        "total_pages": total_pages,
        "current_page": 0,
        "image_size": detection["image_size"],
        "photo": detection["photo"],
        "signature": detection["signature"],
        "preview_url": doc_preview_url
    }


@app.post("/api/upload")
async def upload_document(
    file: UploadFile = File(...),
    page: int = Query(0, ge=0)
):
    """
    Uploads a document (PDF or Image), detects photo and signature,
    and returns coordinate proposals and visual preview.
    """
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        
    doc_id = uuid.uuid4().hex
    
    filename = file.filename or "uploaded_document.jpg"
    try:
        img, total_pages = extractor.load_document(file_bytes, filename, page_index=page)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process document: {str(e)}")
        
    detection = extractor.detect(img)
    
    DOC_STORE[doc_id] = {
        "img": img,
        "filename": filename,
        "total_pages": total_pages,
        "current_page": page,
        "detection": detection,
        "raw_bytes": file_bytes
    }
    
    # Encode preview directly from img to guarantee 1:1 pixel coordinate matching with detection
    _, enc = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 88])
    doc_preview_url = img_to_base64_data_url(enc.tobytes(), "image/jpeg")
    
    return {
        "doc_id": doc_id,
        "filename": file.filename,
        "total_pages": total_pages,
        "current_page": page,
        "image_size": detection["image_size"],
        "photo": detection["photo"],
        "signature": detection["signature"],
        "preview_url": doc_preview_url
    }


@app.post("/api/change-page")
async def change_pdf_page(doc_id: str = Form(...), page: int = Form(...)):
    """Switches active page for multi-page PDF documents."""
    if doc_id not in DOC_STORE:
        raise HTTPException(status_code=404, detail="Session expired. Please re-upload document.")
        
    session = DOC_STORE[doc_id]
    file_bytes = session["raw_bytes"]
    filename = session["filename"]
    
    img, total_pages = extractor.load_document(file_bytes, filename, page_index=page)
    detection = extractor.detect(img)
    
    session["img"] = img
    session["current_page"] = page
    session["detection"] = detection
    
    _, enc = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    doc_preview_url = img_to_base64_data_url(enc.tobytes(), "image/jpeg")
    
    return {
        "doc_id": doc_id,
        "filename": filename,
        "total_pages": total_pages,
        "current_page": page,
        "image_size": detection["image_size"],
        "photo": detection["photo"],
        "signature": detection["signature"],
        "preview_url": doc_preview_url
    }


@app.post("/api/process")
async def process_document(req: ProcessRequest):
    """
    Extracts and enhances photo and signature based on user coordinates and settings.
    Returns preview data URLs, file sizes, and download tokens.
    """
    if req.doc_id not in DOC_STORE:
        raise HTTPException(status_code=404, detail="Document session not found. Please upload again.")
        
    session = DOC_STORE[req.doc_id]
    img = session["img"]
    
    p_set = req.photo_settings or {}
    s_set = req.sig_settings or {}
    
    photo_box = {
        "x": int(req.photo_box.x),
        "y": int(req.photo_box.y),
        "width": int(req.photo_box.width),
        "height": int(req.photo_box.height)
    }
    
    sig_box = {
        "x": int(req.sig_box.x),
        "y": int(req.sig_box.y),
        "width": int(req.sig_box.width),
        "height": int(req.sig_box.height)
    }
    
    # 1. Process Photo
    p_bytes, pw, ph, pkb = extractor.crop_and_enhance_photo(
        img=img,
        box=photo_box,
        target_width=p_set.get("width"),
        target_height=p_set.get("height"),
        brightness=float(p_set.get("brightness", 1.0)),
        contrast=float(p_set.get("contrast", 1.0)),
        sharpen=bool(p_set.get("sharpen", True)),
        add_border=bool(p_set.get("add_border", False)),
        target_kb=p_set.get("target_kb")
    )
    
    # 2. Process Signature
    s_bytes, sw, sh, skb, smime = extractor.crop_and_enhance_signature(
        img=img,
        box=sig_box,
        mode=s_set.get("mode", "clean_white"),
        ink_color=s_set.get("ink_color", "original"),
        threshold_val=int(s_set.get("threshold", 190)),
        target_width=s_set.get("width"),
        target_height=s_set.get("height"),
        target_kb=s_set.get("target_kb")
    )
    
    # Cache processed outputs for download
    session["processed_photo"] = {
        "bytes": p_bytes,
        "width": pw,
        "height": ph,
        "kb": pkb,
        "mime": "image/jpeg",
        "ext": "jpg"
    }
    
    session["processed_sig"] = {
        "bytes": s_bytes,
        "width": sw,
        "height": sh,
        "kb": skb,
        "mime": smime,
        "ext": "png" if smime == "image/png" else "jpg"
    }
    
    return {
        "photo": {
            "preview_url": img_to_base64_data_url(p_bytes, "image/jpeg"),
            "width": pw,
            "height": ph,
            "size_kb": pkb
        },
        "signature": {
            "preview_url": img_to_base64_data_url(s_bytes, smime),
            "width": sw,
            "height": sh,
            "size_kb": skb,
            "mime": smime
        }
    }


@app.get("/api/download/{item_type}")
async def download_item(item_type: str, doc_id: str):
    """
    Downloads extracted photo, signature, or both as a ZIP file.
    item_type: 'photo', 'signature', or 'zip'
    """
    if doc_id not in DOC_STORE:
        raise HTTPException(status_code=404, detail="Document session not found.")
        
    session = DOC_STORE[doc_id]
    base_name = os.path.splitext(session["filename"])[0]
    
    if item_type == "photo":
        if "processed_photo" not in session:
            raise HTTPException(status_code=400, detail="Photo not yet processed.")
        photo_info = session["processed_photo"]
        return Response(
            content=photo_info["bytes"],
            media_type=photo_info["mime"],
            headers={"Content-Disposition": f'attachment; filename="{base_name}_photo.{photo_info["ext"]}"'}
        )
        
    elif item_type == "signature":
        if "processed_sig" not in session:
            raise HTTPException(status_code=400, detail="Signature not yet processed.")
        sig_info = session["processed_sig"]
        return Response(
            content=sig_info["bytes"],
            media_type=sig_info["mime"],
            headers={"Content-Disposition": f'attachment; filename="{base_name}_signature.{sig_info["ext"]}"'}
        )
        
    elif item_type == "zip":
        if "processed_photo" not in session or "processed_sig" not in session:
            raise HTTPException(status_code=400, detail="Images not yet processed.")
            
        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            p_info = session["processed_photo"]
            s_info = session["processed_sig"]
            zf.writestr(f"{base_name}_photo.{p_info['ext']}", p_info["bytes"])
            zf.writestr(f"{base_name}_signature.{s_info['ext']}", s_info["bytes"])
            
        zip_buf.seek(0)
        return Response(
            content=zip_buf.getvalue(),
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{base_name}_extracted_bundle.zip"'}
        )
        
    else:
        raise HTTPException(status_code=400, detail="Invalid item type.")


@app.post("/api/batch-process")
async def batch_process(
    files: List[UploadFile] = File(...),
    preset_key: str = Form("custom"),
    target_photo_kb: Optional[int] = Form(50),
    target_sig_kb: Optional[int] = Form(20),
    sig_mode: str = Form("clean_white")
):
    """
    Batch processes multiple forms in one request.
    Extracts photo and signature for each form automatically.
    Returns gallery list + ZIP download token.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")
        
    preset = PRESETS.get(preset_key, PRESETS["custom"])
    pw = preset["photo"]["width"]
    ph = preset["photo"]["height"]
    sw = preset["signature"]["width"]
    sh = preset["signature"]["height"]
    
    batch_id = uuid.uuid4().hex
    zip_buf = io.BytesIO()
    results = []
    
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for idx, file in enumerate(files):
            try:
                raw_bytes = await file.read()
                img, _ = extractor.load_document(raw_bytes, file.filename)
                det = extractor.detect(img)
                
                # Crop and enhance photo
                p_bytes, pw_out, ph_out, pkb = extractor.crop_and_enhance_photo(
                    img, det["photo"]["box"],
                    target_width=pw, target_height=ph,
                    target_kb=target_photo_kb
                )
                
                # Crop and enhance signature
                s_bytes, sw_out, sh_out, skb, smime = extractor.crop_and_enhance_signature(
                    img, det["signature"]["box"],
                    mode=sig_mode,
                    target_width=sw, target_height=sh,
                    target_kb=target_sig_kb
                )
                
                base_name = os.path.splitext(file.filename)[0]
                s_ext = "png" if smime == "image/png" else "jpg"
                
                zf.writestr(f"{idx+1}_{base_name}_photo.jpg", p_bytes)
                zf.writestr(f"{idx+1}_{base_name}_signature.{s_ext}", s_bytes)
                
                results.append({
                    "filename": file.filename,
                    "photo": {
                        "preview_url": img_to_base64_data_url(p_bytes, "image/jpeg"),
                        "width": pw_out,
                        "height": ph_out,
                        "size_kb": pkb,
                        "confidence": det["photo"]["confidence"]
                    },
                    "signature": {
                        "preview_url": img_to_base64_data_url(s_bytes, smime),
                        "width": sw_out,
                        "height": sh_out,
                        "size_kb": skb,
                        "confidence": det["signature"]["confidence"]
                    }
                })
            except Exception as e:
                results.append({
                    "filename": file.filename,
                    "error": str(e)
                })
                
    zip_buf.seek(0)
    zip_bytes = zip_buf.getvalue()
    
    # Store batch zip in session cache
    DOC_STORE[batch_id] = {
        "is_batch": True,
        "zip_bytes": zip_bytes,
        "count": len(files)
    }
    
    return {
        "batch_id": batch_id,
        "processed_count": len(results),
        "results": results
    }


@app.get("/api/batch-download/{batch_id}")
async def batch_download(batch_id: str):
    if batch_id not in DOC_STORE or not DOC_STORE[batch_id].get("is_batch"):
        raise HTTPException(status_code=404, detail="Batch session not found.")
        
    zip_data = DOC_STORE[batch_id]["zip_bytes"]
    return Response(
        content=zip_data,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="form_batch_extracted_bundle.zip"'}
    )


# Serve frontend directly from project root (no separate static folder)
base_dir = os.path.dirname(os.path.abspath(__file__))

@app.api_route("/", methods=["GET", "HEAD"])
async def serve_index():
    index_path = os.path.join(base_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path, media_type="text/html")
    raise HTTPException(status_code=404, detail="index.html not found.")

@app.api_route("/{filename}", methods=["GET", "HEAD"])
async def serve_static_asset(filename: str):
    allowed_files = {
        "index.html": "text/html",
        "style.css": "text/css",
        "app.js": "application/javascript",
        "favicon.ico": "image/x-icon"
    }
    if filename in allowed_files:
        asset_path = os.path.join(base_dir, filename)
        if os.path.exists(asset_path):
            return FileResponse(asset_path, media_type=allowed_files[filename])
    raise HTTPException(status_code=404, detail="File not found.")


if __name__ == "__main__":
    import uvicorn
    import webbrowser
    import threading
    import time
    
    port = 8000
    url = f"http://127.0.0.1:{port}"
    
    def open_browser():
        time.sleep(1.0)
        try:
            webbrowser.open(url)
        except Exception:
            pass

    threading.Thread(target=open_browser, daemon=True).start()
    print(f"\n" + "="*60)
    print(f"  FormExtract Pro is running at: {url}")
    print(f"  Opening browser automatically at {url}...")
    print(f"="*60 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=port)
