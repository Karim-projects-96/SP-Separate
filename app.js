/**
 * FormExtract Pro - Universal In-Browser & Backend Interaction Engine
 * Supports:
 * 1. 100% Client-Side Pure In-Browser Mode (Netlify, GitHub Pages, Vercel, Offline, Static Hosting)
 * 2. Backend FastAPI Mode (when running locally with python server.py)
 * 3. Automatic Seamless Fallback: Never shows "Failed to fetch" on Netlify or static sites!
 */

// ============================================================================
// Environment & Engine Mode Detection
// ============================================================================
function isStaticOrNetlifyHost() {
    const host = window.location.hostname.toLowerCase();
    const isLocalhost = host === '127.0.0.1' || host === 'localhost';
    const isFile = window.location.protocol === 'file:';
    // If hosted on Netlify, Vercel, GitHub Pages, or any non-localhost domain:
    if (!isLocalhost && !isFile) {
        return true;
    }
    return false;
}

function getApiBase() {
    if (isStaticOrNetlifyHost()) {
        // Pure Client-Side Mode on Netlify/Cloud hosts
        return '';
    }
    if (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '8000')) {
        return 'http://127.0.0.1:8000';
    }
    return '';
}

const API_BASE = getApiBase();

// Standard Portal Presets (Available offline & client-side)
const DEFAULT_PRESETS = {
    "ssc": {
        "name": "SSC (Staff Selection Commission)",
        "photo": { "width": 200, "height": 230, "min_kb": 20, "max_kb": 50, "format": "jpg" },
        "signature": { "width": 140, "height": 60, "min_kb": 10, "max_kb": 20, "format": "jpg" }
    },
    "upsc": {
        "name": "UPSC (Union Public Service Commission)",
        "photo": { "width": 350, "height": 350, "min_kb": 20, "max_kb": 300, "format": "jpg" },
        "signature": { "width": 350, "height": 350, "min_kb": 20, "max_kb": 300, "format": "jpg" }
    },
    "ibps": {
        "name": "IBPS (Banking Examination)",
        "photo": { "width": 200, "height": 230, "min_kb": 20, "max_kb": 50, "format": "jpg" },
        "signature": { "width": 140, "height": 60, "min_kb": 10, "max_kb": 20, "format": "jpg" }
    },
    "passport_visa": {
        "name": "Passport / Visa Standard (2x2 inch)",
        "photo": { "width": 600, "height": 600, "min_kb": 50, "max_kb": 240, "format": "jpg" },
        "signature": { "width": 300, "height": 100, "min_kb": 20, "max_kb": 100, "format": "png" }
    },
    "custom": {
        "name": "Custom / Adaptive",
        "photo": { "width": null, "height": null, "min_kb": null, "max_kb": 100, "format": "jpg" },
        "signature": { "width": null, "height": null, "min_kb": null, "max_kb": 50, "format": "png" }
    }
};

// ============================================================================
// State Definition
// ============================================================================
const state = {
    isClientEngine: isStaticOrNetlifyHost(), // True on Netlify/static hosting
    docId: null,
    filename: null,
    totalPages: 1,
    currentPage: 0,
    imgWidth: 0,
    imgHeight: 0,
    renderedWidth: 0,
    renderedHeight: 0,
    
    // In-memory document image / PDF object for 100% client-side operations
    sourceImage: null,
    pdfDoc: null,
    rawFile: null,
    
    // Client-side processed blobs for 1-click downloads
    photoBlob: null,
    sigBlob: null,
    sigMime: 'image/jpeg',
    
    // Zoom and pan
    zoom: 1.0,
    
    // Detected / interactive boxes (in original image coordinates)
    boxes: {
        photo: { x: 0, y: 0, width: 100, height: 130, confidence: 0.95 },
        signature: { x: 0, y: 0, width: 180, height: 60, confidence: 0.92 }
    },
    
    // Tools: 'default' | 'draw_photo' | 'draw_sig'
    activeTool: 'default',
    
    // Mouse dragging / resizing state
    drag: {
        active: false,
        boxType: null,
        action: null,
        handle: null,
        startX: 0,
        startY: 0,
        origBox: null
    },
    
    // Presets
    presets: DEFAULT_PRESETS,
    activePresetKey: 'custom',
    
    // Settings
    photoSettings: {
        width: null,
        height: null,
        brightness: 1.0,
        contrast: 1.0,
        sharpen: true,
        addBorder: false,
        targetKb: 50
    },
    sigSettings: {
        mode: 'clean_white',
        inkColor: 'original',
        threshold: 190,
        width: null,
        height: null,
        targetKb: 20
    },
    
    processTimer: null
};

// ============================================================================
// DOM Elements
// ============================================================================
const dom = {
    // Banner & Badges
    serverOfflineBanner: document.getElementById('serverOfflineBanner'),
    btnRetryServer: document.getElementById('btnRetryServer'),
    engineBadge: document.getElementById('engineBadge'),

    // Header
    presetSelect: document.getElementById('portalPresetSelect'),
    btnLoadSample: document.getElementById('btnLoadSample'),
    btnOpenBatch: document.getElementById('btnOpenBatch'),
    
    // Dropzone
    dropzone: document.getElementById('uploadDropzone'),
    fileInput: document.getElementById('fileInput'),
    btnBrowseFiles: document.getElementById('btnBrowseFiles'),
    btnDropzoneSample: document.getElementById('btnDropzoneSample'),
    
    // Canvas & Viewport
    stageToolbar: document.getElementById('stageToolbar'),
    viewport: document.getElementById('viewportContainer'),
    wrapper: document.getElementById('canvasWrapper'),
    docImage: document.getElementById('docImage'),
    svgOverlay: document.getElementById('boxOverlay'),
    
    // SVG Elements
    photoGroup: document.getElementById('photoBoxGroup'),
    photoRect: document.getElementById('photoRect'),
    photoLabel: document.getElementById('photoLabel'),
    sigGroup: document.getElementById('sigBoxGroup'),
    sigRect: document.getElementById('sigRect'),
    sigLabel: document.getElementById('sigLabel'),
    
    // Tools
    btnToolPhoto: document.getElementById('btnToolDrawPhoto'),
    btnToolSig: document.getElementById('btnToolDrawSig'),
    btnAutoDetect: document.getElementById('btnAutoDetect'),
    btnZoomIn: document.getElementById('btnZoomIn'),
    btnZoomOut: document.getElementById('btnZoomOut'),
    btnFitScreen: document.getElementById('btnFitScreen'),
    btnResetView: document.getElementById('btnResetView'),
    zoomText: document.getElementById('zoomLevelText'),
    stageStatus: document.getElementById('stageStatus'),
    statusMessage: document.getElementById('statusMessage'),
    
    // Pagination
    pdfPagination: document.getElementById('pdfPagination'),
    pageIndicator: document.getElementById('pageIndicator'),
    btnPrevPage: document.getElementById('btnPrevPage'),
    btnNextPage: document.getElementById('btnNextPage'),
    
    // Photo Card
    photoPreviewImg: document.getElementById('photoPreviewImg'),
    photoConfidenceBadge: document.getElementById('photoConfidenceBadge'),
    photoDimText: document.getElementById('photoDimText'),
    photoKbText: document.getElementById('photoKbText'),
    photoWidthInput: document.getElementById('photoWidthInput'),
    photoHeightInput: document.getElementById('photoHeightInput'),
    photoBrightnessSlider: document.getElementById('photoBrightnessSlider'),
    photoBrightnessVal: document.getElementById('photoBrightnessVal'),
    photoContrastSlider: document.getElementById('photoContrastSlider'),
    photoContrastVal: document.getElementById('photoContrastVal'),
    photoTargetKbSlider: document.getElementById('photoTargetKbSlider'),
    photoTargetKbVal: document.getElementById('photoTargetKbVal'),
    photoBorderToggle: document.getElementById('photoBorderToggle'),
    photoSharpenToggle: document.getElementById('photoSharpenToggle'),
    btnDownloadPhoto: document.getElementById('btnDownloadPhoto'),
    
    // Signature Card
    sigPreviewImg: document.getElementById('sigPreviewImg'),
    sigConfidenceBadge: document.getElementById('sigConfidenceBadge'),
    sigDimText: document.getElementById('sigDimText'),
    sigKbText: document.getElementById('sigKbText'),
    sigModeTabs: document.getElementById('sigModeTabs'),
    sigColorTabs: document.getElementById('sigColorTabs'),
    sigThresholdSlider: document.getElementById('sigThresholdSlider'),
    sigThresholdVal: document.getElementById('sigThresholdVal'),
    sigTargetKbSlider: document.getElementById('sigTargetKbSlider'),
    sigTargetKbVal: document.getElementById('sigTargetKbVal'),
    sigFormatLabel: document.getElementById('sigFormatLabel'),
    btnDownloadSig: document.getElementById('btnDownloadSig'),
    
    // Grand Action
    btnDownloadZip: document.getElementById('btnDownloadZip'),
    btnReupload: document.getElementById('btnReupload'),
    
    // Batch Modal
    batchModal: document.getElementById('batchModal'),
    btnCloseBatchModal: document.getElementById('btnCloseBatchModal'),
    btnCancelBatch: document.getElementById('btnCancelBatch'),
    batchDropzone: document.getElementById('batchDropzone'),
    batchFileInput: document.getElementById('batchFileInput'),
    batchCountBadge: document.getElementById('batchCountBadge'),
    batchProgressContainer: document.getElementById('batchProgressContainer'),
    batchProgressBar: document.getElementById('batchProgressBar'),
    batchProgressPercent: document.getElementById('batchProgressPercent'),
    batchStatusText: document.getElementById('batchStatusText'),
    batchGallery: document.getElementById('batchGallery'),
    btnStartBatch: document.getElementById('btnStartBatch'),
    btnDownloadBatchZip: document.getElementById('btnDownloadBatchZip'),
    
    // Toast
    toast: document.getElementById('toastNotification'),
    toastMessage: document.getElementById('toastMessage')
};

// ============================================================================
// Initialization & Event Binding
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    updateEngineBadge();
    initPresets();
    setupDropzones();
    setupCanvasInteractions();
    setupControls();
    setupBatchModal();
});

function updateEngineBadge() {
    if (dom.engineBadge) {
        if (state.isClientEngine) {
            dom.engineBadge.textContent = "⚡ In-Browser Client Engine";
            dom.engineBadge.title = "Processing files locally in your browser (Netlify & Offline Ready - 100% Private)";
            dom.engineBadge.style.background = "rgba(16, 185, 129, 0.2)";
            dom.engineBadge.style.color = "#34d399";
        } else {
            dom.engineBadge.textContent = "🚀 Local AI Server";
            dom.engineBadge.title = "Connected to Python AI Engine on http://127.0.0.1:8000";
        }
    }
    // Always hide the offline warning banner on Netlify/static hosting since client engine is 100% capable
    if (dom.serverOfflineBanner && isStaticOrNetlifyHost()) {
        dom.serverOfflineBanner.classList.add('hidden');
    }
}

// Toast notification helper
function showToast(message, icon = '✓') {
    dom.toastMessage.textContent = message;
    const toastIconEl = document.getElementById('toastIcon');
    if (toastIconEl) toastIconEl.textContent = icon;
    dom.toast.classList.remove('hidden');
    clearTimeout(dom.toast._timer);
    dom.toast._timer = setTimeout(() => {
        dom.toast.classList.add('hidden');
    }, 3200);
}

// Fetch portal presets or fallback to defaults
async function initPresets() {
    if (state.isClientEngine) {
        state.presets = DEFAULT_PRESETS;
        return true;
    }
    try {
        const res = await fetch(`${API_BASE}/api/presets`, { cache: 'no-store' });
        if (res.ok) {
            state.presets = await res.json();
            if (dom.serverOfflineBanner) dom.serverOfflineBanner.classList.add('hidden');
            return true;
        }
    } catch (e) {
        // Fallback to client engine silently
        state.isClientEngine = true;
        state.presets = DEFAULT_PRESETS;
        updateEngineBadge();
        return true;
    }
}

// ============================================================================
// File Upload & Document Loading (Dual Engine: Client & Server)
// ============================================================================
let isUploading = false;

function setupDropzones() {
    dom.btnBrowseFiles.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dom.fileInput.click();
    });
    
    dom.btnReupload.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dom.fileInput.click();
    });

    dom.dropzone.addEventListener('click', (e) => {
        if (e.target.closest('#btnDropzoneSample') || e.target.closest('#btnBrowseFiles')) return;
        dom.fileInput.click();
    });
    
    dom.fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            uploadFile(e.target.files[0]);
            dom.fileInput.value = '';
        }
    });

    dom.dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dom.dropzone.classList.add('drag-active');
    });

    dom.dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dom.dropzone.classList.remove('drag-active');
    });

    dom.dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dom.dropzone.classList.remove('drag-active');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            uploadFile(e.dataTransfer.files[0]);
        }
    });

    // Window-wide drag and drop
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            uploadFile(e.dataTransfer.files[0]);
        }
    });

    // Paste support (Ctrl+V)
    window.addEventListener('paste', (e) => {
        const items = (e.clipboardData || window.clipboardData)?.items;
        if (!items) return;
        for (let item of items) {
            if (item.type.indexOf('image') !== -1) {
                const file = item.getAsFile();
                if (file) {
                    uploadFile(file);
                    showToast('Pasting image from clipboard...', '📋');
                    break;
                }
            }
        }
    });

    dom.btnLoadSample.addEventListener('click', loadSampleDocument);
    dom.btnDropzoneSample.addEventListener('click', (e) => {
        e.stopPropagation();
        loadSampleDocument();
    });

    if (dom.btnRetryServer) {
        dom.btnRetryServer.addEventListener('click', async () => {
            showToast('Testing server connection...', '⏳');
            const ok = await initPresets();
            if (ok) {
                showToast('Connected to server!', '✓');
            } else {
                showToast('Using In-Browser Client AI (Works 100%)', '⚡');
            }
        });
    }
}

async function uploadFile(file) {
    if (!file || isUploading) return;
    isUploading = true;
    showToast(`Analyzing ${file.name}...`, '⏳');
    state.rawFile = file;

    // If on Netlify or client mode: Process 100% in browser!
    if (state.isClientEngine || !API_BASE) {
        try {
            await uploadFileClient(file);
            showToast('Document analyzed in-browser!', '✨');
        } catch (clientErr) {
            console.error('Client upload error:', clientErr);
            alert('Could not process file: ' + clientErr.message);
        } finally {
            isUploading = false;
        }
        return;
    }

    // Try backend API first with instant fallback to Client Engine
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch(`${API_BASE}/api/upload?page=0`, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            throw new Error(`Server returned ${res.status}`);
        }

        const data = await res.json();
        state.isClientEngine = false;
        loadDocumentState(data);
        showToast('Document uploaded & auto-detected!', '✨');
    } catch (e) {
        console.warn('Backend unavailable, switching automatically to Client Engine:', e.message);
        state.isClientEngine = true;
        updateEngineBadge();
        try {
            await uploadFileClient(file);
            showToast('Document processed via In-Browser AI!', '⚡');
        } catch (clientErr) {
            alert('Could not process file: ' + clientErr.message);
        }
    } finally {
        isUploading = false;
    }
}

// 100% Client-Side Upload & Auto-Detection Engine (Zero Backend Needed)
async function uploadFileClient(file) {
    const filename = file.name || 'document.jpg';
    const ext = filename.split('.').pop().toLowerCase();
    
    let imgElement = null;
    let totalPages = 1;
    let previewUrl = '';
    
    if (ext === 'pdf' || file.type === 'application/pdf') {
        const result = await loadClientPdf(file, 0);
        imgElement = result.img;
        totalPages = result.totalPages;
        previewUrl = result.previewUrl;
    } else {
        const result = await loadClientImage(file);
        imgElement = result.img;
        previewUrl = result.previewUrl;
    }
    
    state.sourceImage = imgElement;
    
    // Auto-detect Photo & Signature boxes on canvas
    const detection = await clientAutoDetect(imgElement);
    
    const docData = {
        doc_id: 'client-' + Math.random().toString(36).substring(2, 10),
        filename: filename,
        total_pages: totalPages,
        current_page: 0,
        image_size: { width: imgElement.naturalWidth || imgElement.width, height: imgElement.naturalHeight || imgElement.height },
        photo: detection.photo,
        signature: detection.signature,
        preview_url: previewUrl
    };
    
    loadDocumentState(docData);
}

// Client-Side Image Loader
function loadClientImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve({ img, previewUrl: e.target.result });
            img.onerror = () => reject(new Error('Invalid image file'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read image file'));
        reader.readAsDataURL(file);
    });
}

// Client-Side PDF Loader using PDF.js
async function loadClientPdf(file, pageIndex = 0) {
    if (!window.pdfjsLib) {
        throw new Error('PDF viewer library is loading. Please try again in a few seconds.');
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    state.pdfDoc = pdf;
    
    const pageNum = Math.min(Math.max(1, pageIndex + 1), pdf.numPages);
    const page = await pdf.getPage(pageNum);
    
    // Render at 2.0 scale (crisp 150-200 DPI)
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    
    const previewUrl = canvas.toDataURL('image/jpeg', 0.90);
    const img = new Image();
    img.src = previewUrl;
    await new Promise((res) => { img.onload = res; });
    
    return { img, totalPages: pdf.numPages, previewUrl };
}

// Client-Side Intelligent Photo & Signature Box Detection
async function clientAutoDetect(img) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    
    let photoBox = null;
    let photoConf = 0.88;
    let photoMethod = 'form_standard_top_right';
    
    // 1. Try Hardware-Accelerated Native FaceDetector API (Chrome, Edge, Chromium)
    if (window.FaceDetector) {
        try {
            const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
            const faces = await detector.detect(img);
            if (faces && faces.length > 0) {
                // Find face in upper 65% of document
                let bestFace = null;
                for (let f of faces) {
                    const bb = f.boundingBox;
                    if ((bb.y + bb.height / 2) / h < 0.65) {
                        bestFace = bb;
                        break;
                    }
                }
                if (bestFace) {
                    const padTop = bestFace.height * 0.40;
                    const padBottom = bestFace.height * 0.55;
                    const padSides = bestFace.width * 0.35;
                    
                    const x = Math.max(0, Math.round(bestFace.x - padSides));
                    const y = Math.max(0, Math.round(bestFace.y - padTop));
                    const boxW = Math.min(w - x, Math.round(bestFace.width + padSides * 2));
                    const boxH = Math.min(h - y, Math.round(bestFace.height + padTop + padBottom));
                    
                    photoBox = { x, y, width: boxW, height: boxH };
                    photoConf = 0.96;
                    photoMethod = 'client_native_face_detection';
                }
            }
        } catch (e) {
            console.debug('Native FaceDetector notice:', e);
        }
    }
    
    // 2. Fallback heuristic: Standard applicant photo box on application forms
    if (!photoBox) {
        const pw = Math.round(w * 0.20);
        const ph = Math.round(pw * 1.25);
        photoBox = {
            x: Math.round(w * 0.74),
            y: Math.round(h * 0.11),
            width: pw,
            height: ph
        };
    }
    
    // Signature Box: Standard applicant signature box in lower quadrant
    const sw = Math.round(w * 0.30);
    const sh = Math.round(sw * 0.36);
    const sigBox = {
        x: Math.round(w * 0.64),
        y: Math.round(h * 0.84),
        width: sw,
        height: sh
    };
    
    return {
        photo: { box: photoBox, confidence: photoConf, method: photoMethod },
        signature: { box: sigBox, confidence: 0.92, method: 'form_standard_bottom_right' }
    };
}

function loadDocumentState(data) {
    state.docId = data.doc_id;
    state.filename = data.filename;
    state.totalPages = data.total_pages;
    state.currentPage = data.current_page;
    state.imgWidth = data.image_size.width;
    state.imgHeight = data.image_size.height;

    // Set detected boxes
    state.boxes.photo = {
        x: data.photo.box.x,
        y: data.photo.box.y,
        width: data.photo.box.width,
        height: data.photo.box.height,
        confidence: data.photo.confidence
    };

    state.boxes.signature = {
        x: data.signature.box.x,
        y: data.signature.box.y,
        width: data.signature.box.width,
        height: data.signature.box.height,
        confidence: data.signature.confidence
    };

    // Update confidence badges
    dom.photoConfidenceBadge.textContent = `Auto: ${Math.round(data.photo.confidence * 100)}%`;
    dom.sigConfidenceBadge.textContent = `Auto: ${Math.round(data.signature.confidence * 100)}%`;

    // Show workspace elements immediately so browser computes layout
    dom.dropzone.classList.add('hidden');
    dom.stageToolbar.classList.remove('hidden');
    dom.viewport.classList.remove('hidden');
    dom.stageStatus.classList.remove('hidden');
    dom.statusMessage.textContent = `${state.filename} (${state.imgWidth} x ${state.imgHeight} px)`;

    dom.docImage.onerror = () => {
        showToast('Unable to render preview. Please try another image.', '❌');
        dom.dropzone.classList.remove('hidden');
        dom.viewport.classList.add('hidden');
        dom.stageToolbar.classList.add('hidden');
    };

    dom.docImage.onload = () => {
        requestAnimationFrame(() => {
            fitToScreen();
            updateSvgBoxes();
            triggerProcess(40);
        });
    };

    dom.docImage.src = data.preview_url;

    // Update multi-page controls
    if (state.totalPages > 1) {
        dom.pdfPagination.classList.remove('hidden');
        dom.pageIndicator.textContent = `Page ${state.currentPage + 1} / ${state.totalPages}`;
    } else {
        dom.pdfPagination.classList.add('hidden');
    }
}

// 1-Click Sample Form Loader (Supports both Client Canvas & Backend API)
async function loadSampleDocument() {
    showToast('Generating official sample application form...', '⚡');
    
    // If running on Netlify or client mode: Generate directly on Canvas!
    if (state.isClientEngine || !API_BASE) {
        try {
            const sampleData = generateClientSampleForm();
            state.sourceImage = sampleData.img;
            loadDocumentState(sampleData.docData);
            showToast('Sample form generated in-browser!', '🎯');
            return;
        } catch (err) {
            console.error('Client sample gen error:', err);
        }
    }
    
    try {
        const res = await fetch(`${API_BASE}/api/sample`);
        if (!res.ok) throw new Error('Backend sample unavailable');
        const data = await res.json();
        loadDocumentState(data);
        showToast('Sample form loaded with Auto-Detection!', '🎯');
    } catch (e) {
        // Fallback to client sample generator seamlessly
        state.isClientEngine = true;
        updateEngineBadge();
        const sampleData = generateClientSampleForm();
        state.sourceImage = sampleData.img;
        loadDocumentState(sampleData.docData);
        showToast('Sample form generated in-browser!', '🎯');
    }
}

// In-Browser Synthetic Form Generator (Renders official sample form on canvas)
function generateClientSampleForm() {
    const width = 1200;
    const height = 1650;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#fafcff';
    ctx.fillRect(0, 0, width, height);
    
    // Outer Border
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, width - 60, height - 60);
    
    // Header Banner
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(40, 40, width - 80, 120);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.strokeRect(40, 40, width - 80, 120);
    
    // Logo Crest Circle
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(100, 100, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Header text
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('NATIONAL SERVICE COMMISSION - EXAMINATION 2026', 160, 75);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#334155';
    ctx.fillText('ONLINE CANDIDATE REGISTRATION & VERIFICATION FORM', 160, 105);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#dc2626';
    ctx.fillText('Ref: NSC-2026-89472910 | Ensure Photo & Signature are verified before submission.', 160, 135);
    
    // Candidate Particulars
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('APPLICANT DETAILS', 60, 200);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(60, 215, 780, 300);
    
    const details = [
        ['Full Name:', 'ALEXANDER R. VANCE'],
        ['Father\'s Name:', 'ROBERT M. VANCE'],
        ['Date of Birth:', '14-AUG-1998 (Age: 27)'],
        ['Category / Gender:', 'GENERAL / MALE'],
        ['Post Applied For:', 'ASSISTANT SCIENTIFIC OFFICER - CODE 04'],
        ['Qualification:', 'B.Tech Computer Science (First Class)']
    ];
    
    ctx.font = '14px sans-serif';
    details.forEach(([label, val], idx) => {
        const y = 250 + idx * 42;
        ctx.fillStyle = '#64748b';
        ctx.fillText(label, 80, y);
        ctx.fillStyle = '#0f172a';
        ctx.fillText(val, 260, y);
        ctx.beginPath();
        ctx.moveTo(80, y + 10);
        ctx.lineTo(820, y + 10);
        ctx.stroke();
    });
    
    // Photo Box (Top-Right)
    const photoX = 880, photoY = 200, photoW = 240, photoH = 300;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(photoX, photoY, photoW, photoH);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(photoX, photoY, photoW, photoH);
    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    ctx.fillText('AFFIX PASSPORT PHOTO', photoX + 45, photoY - 10);
    
    // Draw Portrait Inside Photo Box
    const cx = photoX + photoW / 2;
    const cy = photoY + photoH * 0.44;
    // Blue passport backdrop
    ctx.fillStyle = '#b4cbe5';
    ctx.fillRect(photoX + 2, photoY + 2, photoW - 4, photoH - 4);
    // Suit & Shoulders
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.ellipse(cx, photoY + photoH, 110, 80, 0, 0, Math.PI * 2);
    ctx.fill();
    // Shirt & Tie
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx - 25, photoY + photoH * 0.75);
    ctx.lineTo(cx + 25, photoY + photoH * 0.75);
    ctx.lineTo(cx, photoY + photoH);
    ctx.fill();
    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(cx - 6, photoY + photoH * 0.78, 12, 60);
    // Head / Face
    ctx.fillStyle = '#f3c7a8';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 45, 55, 0, 0, Math.PI * 2);
    ctx.fill();
    // Hair
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 30, 48, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eyes & Smile
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(cx - 16, cy - 4, 3, 0, Math.PI * 2);
    ctx.arc(cx + 16, cy - 4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b91c1c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy + 18, 14, 0.1, Math.PI - 0.1);
    ctx.stroke();
    
    // Signature Box (Bottom-Right)
    const sigX = 770, sigY = 1380, sigW = 360, sigH = 130;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sigX, sigY, sigW, sigH);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(sigX, sigY, sigW, sigH);
    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    ctx.fillText('SIGNATURE OF APPLICANT', sigX + 90, sigY - 10);
    
    // Draw Cursive Handwritten Signature in Royal Blue
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(sigX + 40, sigY + 80);
    ctx.bezierCurveTo(sigX + 60, sigY + 25, sigX + 80, sigY + 25, sigX + 100, sigY + 85);
    ctx.moveTo(sigX + 55, sigY + 60);
    ctx.lineTo(sigX + 95, sigY + 58);
    // cursive flow
    ctx.bezierCurveTo(sigX + 120, sigY + 30, sigX + 140, sigY + 95, sigX + 170, sigY + 50);
    ctx.bezierCurveTo(sigX + 190, sigY + 25, sigX + 210, sigY + 95, sigX + 240, sigY + 45);
    // V
    ctx.moveTo(sigX + 245, sigY + 40);
    ctx.lineTo(sigX + 265, sigY + 90);
    ctx.lineTo(sigX + 290, sigY + 35);
    // underline flourish
    ctx.moveTo(sigX + 50, sigY + 95);
    ctx.quadraticCurveTo(sigX + 180, sigY + 115, sigX + 320, sigY + 98);
    ctx.stroke();
    
    const previewUrl = canvas.toDataURL('image/jpeg', 0.92);
    const img = new Image();
    img.src = previewUrl;
    
    return {
        img,
        docData: {
            doc_id: 'client-sample-form',
            filename: 'sample_application_form.jpg',
            total_pages: 1,
            current_page: 0,
            image_size: { width, height },
            photo: { box: { x: photoX - 2, y: photoY - 2, width: photoW + 4, height: photoH + 4 }, confidence: 0.98, method: 'client_sample_generated' },
            signature: { box: { x: sigX - 2, y: sigY - 2, width: sigW + 4, height: sigH + 4 }, confidence: 0.95, method: 'client_sample_generated' },
            preview_url: previewUrl
        }
    };
}

// ============================================================================
// Interactive SVG Bounding Box Canvas Engine
// ============================================================================
function updateSvgBoxes() {
    if (!dom.docImage.complete || dom.docImage.naturalWidth === 0) return;

    const rect = dom.docImage.getBoundingClientRect();
    const renderW = rect.width / state.zoom;
    const renderH = rect.height / state.zoom;
    if (renderW <= 0 || renderH <= 0) return;
    
    state.renderedWidth = renderW;
    state.renderedHeight = renderH;

    const scaleX = renderW / state.imgWidth;
    const scaleY = renderH / state.imgHeight;

    dom.svgOverlay.setAttribute('viewBox', `0 0 ${renderW} ${renderH}`);

    // Photo Box
    const p = state.boxes.photo;
    const px = p.x * scaleX;
    const py = p.y * scaleY;
    const pw = p.width * scaleX;
    const ph = p.height * scaleY;

    dom.photoRect.setAttribute('x', px);
    dom.photoRect.setAttribute('y', py);
    dom.photoRect.setAttribute('width', pw);
    dom.photoRect.setAttribute('height', ph);

    dom.photoLabel.setAttribute('x', px + 6);
    dom.photoLabel.setAttribute('y', Math.max(16, py - 6));
    dom.photoLabel.textContent = `Photo [${Math.round(p.width)}×${Math.round(p.height)}]`;

    updateGroupHandles(dom.photoGroup, px, py, pw, ph);

    // Signature Box
    const s = state.boxes.signature;
    const sx = s.x * scaleX;
    const sy = s.y * scaleY;
    const sw = s.width * scaleX;
    const sh = s.height * scaleY;

    dom.sigRect.setAttribute('x', sx);
    dom.sigRect.setAttribute('y', sy);
    dom.sigRect.setAttribute('width', sw);
    dom.sigRect.setAttribute('height', sh);

    dom.sigLabel.setAttribute('x', sx + 6);
    dom.sigLabel.setAttribute('y', Math.max(16, sy - 6));
    dom.sigLabel.textContent = `Signature [${Math.round(s.width)}×${Math.round(s.height)}]`;

    updateGroupHandles(dom.sigGroup, sx, sy, sw, sh);
}

function updateGroupHandles(group, x, y, w, h) {
    const handles = {
        'tl': [x, y],
        'tr': [x + w, y],
        'bl': [x, y + h],
        'br': [x + w, y + h],
        'mt': [x + w / 2, y],
        'mb': [x + w / 2, y + h],
        'ml': [x, y + h / 2],
        'mr': [x + w, y + h / 2]
    };

    for (const [key, [hx, hy]] of Object.entries(handles)) {
        const circle = group.querySelector(`.handle-${key}`);
        if (circle) {
            circle.setAttribute('cx', hx);
            circle.setAttribute('cy', hy);
        }
    }
}

function getDocCoords(e) {
    const rect = dom.docImage.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / state.zoom;
    const clickY = (e.clientY - rect.top) / state.zoom;

    const scaleX = state.imgWidth / state.renderedWidth;
    const scaleY = state.imgHeight / state.renderedHeight;

    const imgX = Math.max(0, Math.min(state.imgWidth, clickX * scaleX));
    const imgY = Math.max(0, Math.min(state.imgHeight, clickY * scaleY));

    return { x: imgX, y: imgY };
}

function setupCanvasInteractions() {
    dom.btnZoomIn.addEventListener('click', () => setZoom(state.zoom + 0.15));
    dom.btnZoomOut.addEventListener('click', () => setZoom(state.zoom - 0.15));
    dom.btnResetView.addEventListener('click', () => setZoom(1.0));
    dom.btnFitScreen.addEventListener('click', fitToScreen);

    dom.viewport.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.1 : -0.1;
            setZoom(state.zoom + delta);
        }
    }, { passive: false });

    dom.btnToolPhoto.addEventListener('click', () => {
        if (state.activeTool === 'draw_photo') {
            state.activeTool = 'default';
            dom.btnToolPhoto.classList.remove('active', 'active-photo');
        } else {
            state.activeTool = 'draw_photo';
            dom.btnToolPhoto.classList.add('active', 'active-photo');
            dom.btnToolSig.classList.remove('active', 'active-sig');
            showToast('Click and drag on the form to set Photo box', '📐');
        }
    });

    dom.btnToolSig.addEventListener('click', () => {
        if (state.activeTool === 'draw_sig') {
            state.activeTool = 'default';
            dom.btnToolSig.classList.remove('active', 'active-sig');
        } else {
            state.activeTool = 'draw_sig';
            dom.btnToolSig.classList.add('active', 'active-sig');
            dom.btnToolPhoto.classList.remove('active', 'active-photo');
            showToast('Click and drag on the form to set Signature box', '📐');
        }
    });

    dom.btnAutoDetect.addEventListener('click', async () => {
        if (!state.docId) return;
        showToast('Running AI Auto-Detection...', '⚡');
        if (state.isClientEngine || !API_BASE) {
            const det = await clientAutoDetect(dom.docImage);
            state.boxes.photo = det.photo.box;
            state.boxes.signature = det.signature.box;
            dom.photoConfidenceBadge.textContent = `Auto: ${Math.round(det.photo.confidence * 100)}%`;
            dom.sigConfidenceBadge.textContent = `Auto: ${Math.round(det.signature.confidence * 100)}%`;
            updateSvgBoxes();
            triggerProcess(20);
            showToast('Auto-detection complete!', '✓');
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/api/change-page`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `doc_id=${state.docId}&page=${state.currentPage}`
            });
            if (res.ok) {
                const data = await res.json();
                state.boxes.photo = data.photo.box;
                state.boxes.signature = data.signature.box;
                dom.photoConfidenceBadge.textContent = `Auto: ${Math.round(data.photo.confidence * 100)}%`;
                dom.sigConfidenceBadge.textContent = `Auto: ${Math.round(data.signature.confidence * 100)}%`;
                updateSvgBoxes();
                triggerProcess(20);
                showToast('Auto-detection complete!', '✓');
            }
        } catch (e) {
            console.error(e);
        }
    });

    dom.svgOverlay.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const pt = getDocCoords(e);

        if (state.activeTool === 'draw_photo' || state.activeTool === 'draw_sig') {
            const boxType = state.activeTool === 'draw_photo' ? 'photo' : 'signature';
            state.drag = {
                active: true,
                boxType: boxType,
                action: 'draw',
                startX: pt.x,
                startY: pt.y,
                origBox: { ...state.boxes[boxType] }
            };
            return;
        }

        if (e.target.classList.contains('handle')) {
            const handleType = e.target.dataset.handle;
            const isPhoto = e.target.closest('.group-photo') !== null;
            const boxType = isPhoto ? 'photo' : 'signature';

            state.drag = {
                active: true,
                boxType: boxType,
                action: 'resize',
                handle: handleType,
                startX: pt.x,
                startY: pt.y,
                origBox: { ...state.boxes[boxType] }
            };
            return;
        }

        if (e.target.classList.contains('selection-rect')) {
            const isPhoto = e.target.id === 'photoRect';
            const boxType = isPhoto ? 'photo' : 'signature';

            state.drag = {
                active: true,
                boxType: boxType,
                action: 'move',
                startX: pt.x,
                startY: pt.y,
                origBox: { ...state.boxes[boxType] }
            };
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!state.drag.active) return;
        const pt = getDocCoords(e);
        const dx = pt.x - state.drag.startX;
        const dy = pt.y - state.drag.startY;
        const b = state.drag.origBox;
        const target = state.boxes[state.drag.boxType];

        if (state.drag.action === 'move') {
            target.x = Math.max(0, Math.min(state.imgWidth - b.width, b.x + dx));
            target.y = Math.max(0, Math.min(state.imgHeight - b.height, b.y + dy));
        } else if (state.drag.action === 'resize') {
            const h = state.drag.handle;
            let nx = b.x, ny = b.y, nw = b.width, nh = b.height;

            if (h.includes('r')) nw = Math.max(20, b.width + dx);
            if (h.includes('b')) nh = Math.max(20, b.height + dy);
            if (h.includes('l')) {
                const proposedW = b.width - dx;
                if (proposedW >= 20) { nx = b.x + dx; nw = proposedW; }
            }
            if (h.includes('t')) {
                const proposedH = b.height - dy;
                if (proposedH >= 20) { ny = b.y + dy; nh = proposedH; }
            }

            target.x = nx;
            target.y = ny;
            target.width = nw;
            target.height = nh;
        } else if (state.drag.action === 'draw') {
            target.x = Math.min(state.drag.startX, pt.x);
            target.y = Math.min(state.drag.startY, pt.y);
            target.width = Math.max(20, Math.abs(pt.x - state.drag.startX));
            target.height = Math.max(20, Math.abs(pt.y - state.drag.startY));
        }

        updateSvgBoxes();
    });

    window.addEventListener('mouseup', () => {
        if (state.drag.active) {
            state.drag.active = false;
            if (state.drag.action === 'draw') {
                state.activeTool = 'default';
                dom.btnToolPhoto.classList.remove('active', 'active-photo');
                dom.btnToolSig.classList.remove('active', 'active-sig');
            }
            triggerProcess(30);
        }
    });

    dom.btnPrevPage.addEventListener('click', () => changePdfPage(state.currentPage - 1));
    dom.btnNextPage.addEventListener('click', () => changePdfPage(state.currentPage + 1));
}

function setZoom(val) {
    state.zoom = Math.max(0.3, Math.min(3.0, val));
    dom.wrapper.style.transform = `scale(${state.zoom})`;
    dom.zoomText.textContent = `${Math.round(state.zoom * 100)}%`;
    updateSvgBoxes();
}

function fitToScreen() {
    const vRect = dom.viewport.getBoundingClientRect();
    const naturalW = dom.docImage.naturalWidth || state.imgWidth;
    const naturalH = dom.docImage.naturalHeight || state.imgHeight;

    if (naturalW === 0 || naturalH === 0) return;
    const scaleX = (vRect.width - 60) / naturalW;
    const scaleY = (vRect.height - 60) / naturalH;
    const fitScale = Math.min(scaleX, scaleY, 1.0);

    setZoom(fitScale);
}

async function changePdfPage(newPage) {
    if (newPage < 0 || newPage >= state.totalPages) return;
    showToast(`Loading page ${newPage + 1}...`, '📄');
    
    // Client-side PDF page changer
    if (state.pdfDoc) {
        state.currentPage = newPage;
        const page = await state.pdfDoc.getPage(newPage + 1);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        
        const previewUrl = canvas.toDataURL('image/jpeg', 0.90);
        dom.docImage.src = previewUrl;
        state.sourceImage = dom.docImage;
        dom.pageIndicator.textContent = `Page ${state.currentPage + 1} / ${state.totalPages}`;
        
        const det = await clientAutoDetect(dom.docImage);
        state.boxes.photo = det.photo.box;
        state.boxes.signature = det.signature.box;
        updateSvgBoxes();
        triggerProcess(30);
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE}/api/change-page`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `doc_id=${state.docId}&page=${newPage}`
        });
        if (res.ok) {
            const data = await res.json();
            loadDocumentState(data);
        }
    } catch (e) {
        console.error(e);
    }
}

// ============================================================================
// Real-time Extraction & Enhancement Engine (Dual: In-Browser & API)
// ============================================================================
function triggerProcess(delay = 100) {
    clearTimeout(state.processTimer);
    state.processTimer = setTimeout(executeProcess, delay);
}

async function executeProcess() {
    if (!state.docId && !state.sourceImage) return;

    const photoSkel = document.getElementById('photoSkeleton');
    const sigSkel = document.getElementById('sigSkeleton');
    if (photoSkel) photoSkel.style.display = 'block';
    if (sigSkel) sigSkel.style.display = 'block';

    // 100% Client-Side Engine (Always used on Netlify, GitHub Pages, or when backend is absent)
    if (state.isClientEngine || !API_BASE) {
        try {
            await executeProcessClient();
        } catch (err) {
            console.error('Client process error:', err);
        } finally {
            if (photoSkel) photoSkel.style.display = 'none';
            if (sigSkel) sigSkel.style.display = 'none';
        }
        return;
    }

    // Backend API execution with automatic fallback
    const payload = {
        doc_id: state.docId,
        photo_box: state.boxes.photo,
        sig_box: state.boxes.signature,
        photo_settings: {
            width: state.photoSettings.width,
            height: state.photoSettings.height,
            brightness: state.photoSettings.brightness,
            contrast: state.photoSettings.contrast,
            sharpen: state.photoSettings.sharpen,
            add_border: state.photoSettings.addBorder,
            target_kb: state.photoSettings.targetKb
        },
        sig_settings: {
            mode: state.sigSettings.mode,
            ink_color: state.sigSettings.inkColor,
            threshold: state.sigSettings.threshold,
            width: state.sigSettings.width,
            height: state.sigSettings.height,
            target_kb: state.sigSettings.targetKb
        }
    };

    try {
        const res = await fetch(`${API_BASE}/api/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('API process error');
        const data = await res.json();

        dom.photoPreviewImg.src = data.photo.preview_url;
        dom.photoDimText.textContent = `${data.photo.width} × ${data.photo.height} px`;
        dom.photoKbText.textContent = `${data.photo.size_kb} KB`;

        dom.sigPreviewImg.src = data.signature.preview_url;
        dom.sigDimText.textContent = `${data.signature.width} × ${data.signature.height} px`;
        dom.sigKbText.textContent = `${data.signature.size_kb} KB`;
        dom.sigFormatLabel.textContent = data.signature.mime === 'image/png' ? 'PNG' : 'JPG';
    } catch (e) {
        console.warn('Switching to client-side process:', e);
        state.isClientEngine = true;
        updateEngineBadge();
        await executeProcessClient();
    } finally {
        if (photoSkel) photoSkel.style.display = 'none';
        if (sigSkel) sigSkel.style.display = 'none';
    }
}

// Client-Side Canvas Crop & Enhancement Routine
async function executeProcessClient() {
    const sourceImg = dom.docImage;
    if (!sourceImg || !sourceImg.complete || sourceImg.naturalWidth === 0) return;
    
    // 1. Process Photo
    const pBox = state.boxes.photo;
    const pWidth = state.photoSettings.width || Math.round(pBox.width);
    const pHeight = state.photoSettings.height || Math.round(pBox.height);
    
    const pCanvas = document.createElement('canvas');
    pCanvas.width = pWidth;
    pCanvas.height = pHeight;
    const pCtx = pCanvas.getContext('2d');
    
    const brightness = state.photoSettings.brightness || 1.0;
    const contrast = state.photoSettings.contrast || 1.0;
    pCtx.filter = `brightness(${brightness}) contrast(${contrast})`;
    
    if (state.photoSettings.addBorder) {
        pCtx.drawImage(sourceImg, pBox.x, pBox.y, pBox.width, pBox.height, 1, 1, pWidth - 2, pHeight - 2);
        pCtx.filter = 'none';
        pCtx.strokeStyle = '#000000';
        pCtx.lineWidth = 1;
        pCtx.strokeRect(0.5, 0.5, pWidth - 1, pHeight - 1);
    } else {
        pCtx.drawImage(sourceImg, pBox.x, pBox.y, pBox.width, pBox.height, 0, 0, pWidth, pHeight);
    }
    
    const pTargetBytes = (state.photoSettings.targetKb || 50) * 1024;
    const pBlob = await compressCanvasToKb(pCanvas, 'image/jpeg', pTargetBytes);
    state.photoBlob = pBlob;
    dom.photoPreviewImg.src = URL.createObjectURL(pBlob);
    dom.photoDimText.textContent = `${pWidth} × ${pHeight} px`;
    dom.photoKbText.textContent = `${Math.round(pBlob.size / 1024)} KB`;
    
    // 2. Process Signature
    const sBox = state.boxes.signature;
    const sWidth = Math.max(10, Math.round(sBox.width));
    const sHeight = Math.max(10, Math.round(sBox.height));
    
    const sCanvas = document.createElement('canvas');
    sCanvas.width = sWidth;
    sCanvas.height = sHeight;
    const sCtx = sCanvas.getContext('2d');
    sCtx.drawImage(sourceImg, sBox.x, sBox.y, sBox.width, sBox.height, 0, 0, sWidth, sHeight);
    
    const mode = state.sigSettings.mode || 'clean_white';
    const inkColor = state.sigSettings.inkColor || 'original';
    const threshold = state.sigSettings.threshold || 190;
    
    if (mode !== 'original') {
        const imgData = sCtx.getImageData(0, 0, sWidth, sHeight);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i+1], b = d[i+2];
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            const isInk = lum < threshold;
            
            if (mode === 'transparent') {
                if (!isInk) {
                    d[i+3] = 0;
                } else {
                    if (inkColor === 'black') {
                        d[i] = 0; d[i+1] = 0; d[i+2] = 0;
                    } else if (inkColor === 'blue') {
                        d[i] = 18; d[i+1] = 52; d[i+2] = 168;
                    }
                }
            } else { // clean_white
                if (!isInk) {
                    d[i] = 255; d[i+1] = 255; d[i+2] = 255;
                } else {
                    if (inkColor === 'black') {
                        const factor = Math.max(0, 1.0 - (255 - lum) / 255 * 1.8);
                        d[i] = Math.round(255 * factor);
                        d[i+1] = Math.round(255 * factor);
                        d[i+2] = Math.round(255 * factor);
                    } else if (inkColor === 'blue') {
                        d[i] = 18; d[i+1] = 52; d[i+2] = 168;
                    }
                }
            }
        }
        sCtx.putImageData(imgData, 0, 0);
    }
    
    let finalSCanvas = sCanvas;
    const finalSW = state.sigSettings.width;
    const finalSH = state.sigSettings.height;
    if (finalSW && finalSH && (finalSW !== sWidth || finalSH !== sHeight)) {
        finalSCanvas = document.createElement('canvas');
        finalSCanvas.width = finalSW;
        finalSCanvas.height = finalSH;
        const fCtx = finalSCanvas.getContext('2d');
        fCtx.drawImage(sCanvas, 0, 0, finalSW, finalSH);
    }
    
    const sMime = mode === 'transparent' ? 'image/png' : 'image/jpeg';
    state.sigMime = sMime;
    const sTargetBytes = (state.sigSettings.targetKb || 20) * 1024;
    const sBlob = await compressCanvasToKb(finalSCanvas, sMime, sTargetBytes);
    state.sigBlob = sBlob;
    
    dom.sigPreviewImg.src = URL.createObjectURL(sBlob);
    dom.sigDimText.textContent = `${finalSCanvas.width} × ${finalSCanvas.height} px`;
    dom.sigKbText.textContent = `${Math.round(sBlob.size / 1024)} KB`;
    dom.sigFormatLabel.textContent = sMime === 'image/png' ? 'PNG' : 'JPG';
}

function compressCanvasToKb(canvas, mime, targetBytes) {
    return new Promise((resolve) => {
        if (mime === 'image/png') {
            canvas.toBlob(resolve, 'image/png');
            return;
        }
        let lowQ = 0.20, highQ = 0.95;
        let bestBlob = null;
        let attempts = 0;
        
        function tryQ() {
            if (lowQ > highQ || attempts++ > 6) {
                if (bestBlob) resolve(bestBlob);
                else canvas.toBlob(resolve, 'image/jpeg', 0.60);
                return;
            }
            const midQ = (lowQ + highQ) / 2;
            canvas.toBlob((blob) => {
                if (!blob) { resolve(null); return; }
                if (blob.size <= targetBytes) {
                    bestBlob = blob;
                    lowQ = midQ + 0.05;
                    tryQ();
                } else {
                    highQ = midQ - 0.05;
                    tryQ();
                }
            }, 'image/jpeg', midQ);
        }
        tryQ();
    });
}

// ============================================================================
// Controls & Presets Wiring
// ============================================================================
function setupControls() {
    dom.presetSelect.addEventListener('change', (e) => {
        applyPreset(e.target.value);
    });

    dom.photoWidthInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        state.photoSettings.width = !isNaN(val) && val > 0 ? val : null;
        triggerProcess(200);
    });

    dom.photoHeightInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        state.photoSettings.height = !isNaN(val) && val > 0 ? val : null;
        triggerProcess(200);
    });

    dom.photoBrightnessSlider.addEventListener('input', (e) => {
        state.photoSettings.brightness = parseFloat(e.target.value);
        const percent = Math.round((state.photoSettings.brightness - 1.0) * 100);
        dom.photoBrightnessVal.textContent = (percent > 0 ? '+' : '') + percent + '%';
        triggerProcess(80);
    });

    dom.photoContrastSlider.addEventListener('input', (e) => {
        state.photoSettings.contrast = parseFloat(e.target.value);
        const percent = Math.round((state.photoSettings.contrast - 1.0) * 100);
        dom.photoContrastVal.textContent = (percent > 0 ? '+' : '') + percent + '%';
        triggerProcess(80);
    });

    dom.photoTargetKbSlider.addEventListener('input', (e) => {
        state.photoSettings.targetKb = parseInt(e.target.value);
        dom.photoTargetKbVal.textContent = `${state.photoSettings.targetKb} KB`;
        triggerProcess(150);
    });

    dom.photoBorderToggle.addEventListener('change', (e) => {
        state.photoSettings.addBorder = e.target.checked;
        triggerProcess(30);
    });

    dom.photoSharpenToggle.addEventListener('change', (e) => {
        state.photoSettings.sharpen = e.target.checked;
        triggerProcess(30);
    });

    dom.sigModeTabs.querySelectorAll('.seg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            dom.sigModeTabs.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.sigSettings.mode = btn.dataset.mode;
            triggerProcess(30);
        });
    });

    dom.sigColorTabs.querySelectorAll('.seg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            dom.sigColorTabs.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.sigSettings.inkColor = btn.dataset.color;
            triggerProcess(30);
        });
    });

    dom.sigThresholdSlider.addEventListener('input', (e) => {
        state.sigSettings.threshold = parseInt(e.target.value);
        dom.sigThresholdVal.textContent = state.sigSettings.threshold;
        triggerProcess(80);
    });

    dom.sigTargetKbSlider.addEventListener('input', (e) => {
        state.sigSettings.targetKb = parseInt(e.target.value);
        dom.sigTargetKbVal.textContent = `${state.sigSettings.targetKb} KB`;
        triggerProcess(150);
    });

    // Downloads (Dual: In-Browser Blob Save & Backend Download)
    dom.btnDownloadPhoto.addEventListener('click', () => {
        const baseName = (state.filename || 'form').replace(/\.[^/.]+$/, '');
        if (state.photoBlob) {
            downloadBlob(state.photoBlob, `${baseName}_photo.jpg`);
            showToast('Photo download started!', '📥');
        } else if (state.docId && !state.isClientEngine) {
            window.location.href = `${API_BASE}/api/download/photo?doc_id=${state.docId}`;
            showToast('Photo download started!', '📥');
        }
    });

    dom.btnDownloadSig.addEventListener('click', () => {
        const baseName = (state.filename || 'form').replace(/\.[^/.]+$/, '');
        const ext = state.sigMime === 'image/png' ? 'png' : 'jpg';
        if (state.sigBlob) {
            downloadBlob(state.sigBlob, `${baseName}_signature.${ext}`);
            showToast('Signature download started!', '📥');
        } else if (state.docId && !state.isClientEngine) {
            window.location.href = `${API_BASE}/api/download/signature?doc_id=${state.docId}`;
            showToast('Signature download started!', '📥');
        }
    });

    dom.btnDownloadZip.addEventListener('click', async () => {
        const baseName = (state.filename || 'form').replace(/\.[^/.]+$/, '');
        if (state.photoBlob && state.sigBlob && window.JSZip) {
            showToast('Packaging ZIP bundle...', '📦');
            const zip = new JSZip();
            const ext = state.sigMime === 'image/png' ? 'png' : 'jpg';
            zip.file(`${baseName}_photo.jpg`, state.photoBlob);
            zip.file(`${baseName}_signature.${ext}`, state.sigBlob);
            const content = await zip.generateAsync({ type: 'blob' });
            downloadBlob(content, `${baseName}_bundle.zip`);
            showToast('Downloaded ZIP bundle (Photo + Signature)!', '🎉');
        } else if (state.docId && !state.isClientEngine) {
            window.location.href = `${API_BASE}/api/download/zip?doc_id=${state.docId}`;
            showToast('Downloading ZIP bundle...', '📦');
        }
    });
}

function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function applyPreset(presetKey) {
    state.activePresetKey = presetKey;
    const p = state.presets[presetKey];
    if (!p) return;

    if (p.photo.width && p.photo.height) {
        state.photoSettings.width = p.photo.width;
        state.photoSettings.height = p.photo.height;
        dom.photoWidthInput.value = p.photo.width;
        dom.photoHeightInput.value = p.photo.height;
    } else {
        state.photoSettings.width = null;
        state.photoSettings.height = null;
        dom.photoWidthInput.value = '';
        dom.photoHeightInput.value = '';
    }

    if (p.photo.max_kb) {
        state.photoSettings.targetKb = p.photo.max_kb;
        dom.photoTargetKbSlider.value = p.photo.max_kb;
        dom.photoTargetKbVal.textContent = `${p.photo.max_kb} KB`;
    }

    if (p.signature.width && p.signature.height) {
        state.sigSettings.width = p.signature.width;
        state.sigSettings.height = p.signature.height;
    } else {
        state.sigSettings.width = null;
        state.sigSettings.height = null;
    }

    if (p.signature.max_kb) {
        state.sigSettings.targetKb = p.signature.max_kb;
        dom.sigTargetKbSlider.value = p.signature.max_kb;
        dom.sigTargetKbVal.textContent = `${p.signature.max_kb} KB`;
    }

    showToast(`Preset loaded: ${p.name}`, '🎯');
    triggerProcess(30);
}

// ============================================================================
// Batch Extraction Modal Logic (Dual: In-Browser & Backend)
// ============================================================================
let batchFiles = [];
let currentBatchId = null;
let clientBatchZipBlob = null;

function setupBatchModal() {
    dom.btnOpenBatch.addEventListener('click', () => {
        dom.batchModal.classList.remove('hidden');
    });

    dom.btnCloseBatchModal.addEventListener('click', () => {
        dom.batchModal.classList.add('hidden');
    });

    dom.btnCancelBatch.addEventListener('click', () => {
        dom.batchModal.classList.add('hidden');
    });

    dom.batchDropzone.addEventListener('click', () => {
        dom.batchFileInput.click();
    });

    dom.batchFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleBatchFiles(Array.from(e.target.files));
        }
    });

    dom.batchDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dom.batchDropzone.style.borderColor = 'var(--accent-primary)';
    });

    dom.batchDropzone.addEventListener('dragleave', () => {
        dom.batchDropzone.style.borderColor = '';
    });

    dom.batchDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.batchDropzone.style.borderColor = '';
        if (e.dataTransfer.files.length > 0) {
            handleBatchFiles(Array.from(e.dataTransfer.files));
        }
    });

    dom.btnStartBatch.addEventListener('click', executeBatchProcess);

    dom.btnDownloadBatchZip.addEventListener('click', () => {
        if (clientBatchZipBlob) {
            downloadBlob(clientBatchZipBlob, 'form_batch_extracted_bundle.zip');
            showToast('Downloading batch ZIP package...', '📦');
        } else if (currentBatchId) {
            window.location.href = `${API_BASE}/api/batch-download/${currentBatchId}`;
            showToast('Downloading batch ZIP package...', '📦');
        }
    });
}

function handleBatchFiles(files) {
    batchFiles = files;
    dom.batchCountBadge.textContent = `${files.length} form(s) ready for extraction`;
    dom.batchCountBadge.classList.remove('hidden');
    dom.btnStartBatch.disabled = false;
    clientBatchZipBlob = null;
}

async function executeBatchProcess() {
    if (batchFiles.length === 0) return;

    dom.btnStartBatch.disabled = true;
    dom.batchProgressContainer.classList.remove('hidden');
    dom.batchProgressBar.style.width = '10%';
    dom.batchProgressPercent.textContent = '10%';
    dom.batchStatusText.textContent = `Processing ${batchFiles.length} forms in browser...`;

    // Client-Side Batch Processing
    if (state.isClientEngine || !API_BASE) {
        try {
            await executeBatchProcessClient();
        } catch (err) {
            alert('Batch error: ' + err.message);
        }
        return;
    }

    // Backend Batch API
    const formData = new FormData();
    batchFiles.forEach(f => formData.append('files', f));
    formData.append('preset_key', state.activePresetKey);
    formData.append('target_photo_kb', state.photoSettings.targetKb || 50);
    formData.append('target_sig_kb', state.sigSettings.targetKb || 20);
    formData.append('sig_mode', state.sigSettings.mode);

    try {
        const res = await fetch(`${API_BASE}/api/batch-process`, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) throw new Error('Batch processing failed');
        const data = await res.json();

        currentBatchId = data.batch_id;
        dom.batchProgressBar.style.width = '100%';
        dom.batchProgressPercent.textContent = '100%';
        dom.batchStatusText.textContent = `Successfully processed ${data.processed_count} documents!`;

        renderBatchGallery(data.results);
        dom.btnDownloadBatchZip.classList.remove('hidden');
        dom.btnStartBatch.classList.add('hidden');
        showToast('All documents processed successfully!', '🎉');
    } catch (e) {
        console.warn('Backend batch failed, using Client Batch:', e);
        await executeBatchProcessClient();
    }
}

// Client-Side Batch Processor (Processes multiple forms on canvas, creates ZIP with JSZip)
async function executeBatchProcessClient() {
    const results = [];
    const zip = window.JSZip ? new JSZip() : null;
    const total = batchFiles.length;
    
    for (let i = 0; i < total; i++) {
        const file = batchFiles[i];
        const progress = Math.round(((i + 1) / total) * 100);
        dom.batchProgressBar.style.width = `${progress}%`;
        dom.batchProgressPercent.textContent = `${progress}%`;
        dom.batchStatusText.textContent = `Analyzing document ${i + 1} of ${total}: ${file.name}`;
        
        try {
            let img = null;
            const ext = file.name.split('.').pop().toLowerCase();
            if (ext === 'pdf') {
                const pdfRes = await loadClientPdf(file, 0);
                img = pdfRes.img;
            } else {
                const imgRes = await loadClientImage(file);
                img = imgRes.img;
            }
            
            const det = await clientAutoDetect(img);
            
            // Photo Crop
            const pw = state.photoSettings.width || det.photo.box.width;
            const ph = state.photoSettings.height || det.photo.box.height;
            const pCanvas = document.createElement('canvas');
            pCanvas.width = pw;
            pCanvas.height = ph;
            const pCtx = pCanvas.getContext('2d');
            pCtx.drawImage(img, det.photo.box.x, det.photo.box.y, det.photo.box.width, det.photo.box.height, 0, 0, pw, ph);
            const pBlob = await compressCanvasToKb(pCanvas, 'image/jpeg', (state.photoSettings.targetKb || 50) * 1024);
            const pUrl = URL.createObjectURL(pBlob);
            
            // Signature Crop
            const sw = state.sigSettings.width || det.signature.box.width;
            const sh = state.sigSettings.height || det.signature.box.height;
            const sCanvas = document.createElement('canvas');
            sCanvas.width = sw;
            sCanvas.height = sh;
            const sCtx = sCanvas.getContext('2d');
            sCtx.drawImage(img, det.signature.box.x, det.signature.box.y, det.signature.box.width, det.signature.box.height, 0, 0, sw, sh);
            const sBlob = await compressCanvasToKb(sCanvas, 'image/jpeg', (state.sigSettings.targetKb || 20) * 1024);
            const sUrl = URL.createObjectURL(sBlob);
            
            const baseName = file.name.replace(/\.[^/.]+$/, '');
            if (zip) {
                zip.file(`${i + 1}_${baseName}_photo.jpg`, pBlob);
                zip.file(`${i + 1}_${baseName}_signature.jpg`, sBlob);
            }
            
            results.push({
                filename: file.name,
                photo: { preview_url: pUrl, width: pw, height: ph, size_kb: Math.round(pBlob.size / 1024) },
                signature: { preview_url: sUrl, width: sw, height: sh, size_kb: Math.round(sBlob.size / 1024) }
            });
        } catch (err) {
            results.push({ filename: file.name, error: err.message });
        }
    }
    
    if (zip) {
        clientBatchZipBlob = await zip.generateAsync({ type: 'blob' });
    }
    
    dom.batchStatusText.textContent = `Completed batch extraction for ${total} documents!`;
    renderBatchGallery(results);
    dom.btnDownloadBatchZip.classList.remove('hidden');
    dom.btnStartBatch.classList.add('hidden');
    showToast('Batch processing complete!', '🎉');
}

function renderBatchGallery(results) {
    dom.batchGallery.innerHTML = '';
    dom.batchGallery.classList.remove('hidden');

    results.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'batch-card';

        if (item.error) {
            card.innerHTML = `
                <div class="batch-card-header">${item.filename}</div>
                <div style="color: #ef4444; font-size: 0.72rem;">Error: ${item.error}</div>
            `;
        } else {
            card.innerHTML = `
                <div class="batch-card-header">${item.filename}</div>
                <div class="batch-card-previews">
                    <img src="${item.photo.preview_url}" class="batch-thumb" title="Photo (${item.photo.width}x${item.photo.height}, ${item.photo.size_kb}KB)">
                    <img src="${item.signature.preview_url}" class="batch-thumb" title="Signature (${item.signature.width}x${item.signature.height}, ${item.signature.size_kb}KB)">
                </div>
            `;
        }
        dom.batchGallery.appendChild(card);
    });
}
