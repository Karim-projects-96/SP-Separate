"""
FormExtract Pro - Command-Line Interface (CLI)
Extract photo and signature from single forms or batch folders via terminal.
Usage:
  python cli.py input_form.pdf --output-dir ./extracted
  python cli.py --batch ./forms_folder --output-dir ./all_extracted --preset ssc
"""

import argparse
import os
import sys
from backend.extractor import FormExtractor

PRESET_CONFIGS = {
    "ssc": {"pw": 200, "ph": 230, "pkb": 50, "sw": 140, "sh": 60, "skb": 20, "smode": "clean_white"},
    "upsc": {"pw": 350, "ph": 350, "pkb": 300, "sw": 350, "sh": 350, "skb": 300, "smode": "clean_white"},
    "ibps": {"pw": 200, "ph": 230, "pkb": 50, "sw": 140, "sh": 60, "skb": 20, "smode": "clean_white"},
    "passport": {"pw": 600, "ph": 600, "pkb": 200, "sw": 300, "sh": 100, "skb": 50, "smode": "transparent"},
    "custom": {"pw": None, "ph": None, "pkb": 100, "sw": None, "sh": None, "skb": 50, "smode": "clean_white"}
}


def process_single_file(file_path: str, output_dir: str, config: dict, extractor: FormExtractor):
    base_name = os.path.splitext(os.path.basename(file_path))[0]
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"\n[+] Processing: {file_path}")
    with open(file_path, "rb") as f:
        data = f.read()
        
    img, total_pages = extractor.load_document(data, file_path)
    print(f"    Loaded document ({img.shape[1]}x{img.shape[0]} px, {total_pages} page(s))")
    
    detection = extractor.detect(img)
    p_box = detection["photo"]["box"]
    s_box = detection["signature"]["box"]
    
    print(f"    Detected Photo: confidence={detection['photo']['confidence']} ({detection['photo']['method']})")
    print(f"    Detected Signature: confidence={detection['signature']['confidence']} ({detection['signature']['method']})")
    
    # Process Photo
    p_bytes, pw, ph, pkb = extractor.crop_and_enhance_photo(
        img, p_box,
        target_width=config["pw"],
        target_height=config["ph"],
        target_kb=config["pkb"]
    )
    photo_out = os.path.join(output_dir, f"{base_name}_photo.jpg")
    with open(photo_out, "wb") as f:
        f.write(p_bytes)
    print(f"    Saved Photo: {photo_out} ({pw}x{ph} px, {pkb} KB)")
    
    # Process Signature
    s_bytes, sw, sh, skb, smime = extractor.crop_and_enhance_signature(
        img, s_box,
        mode=config["smode"],
        target_width=config["sw"],
        target_height=config["sh"],
        target_kb=config["skb"]
    )
    s_ext = "png" if smime == "image/png" else "jpg"
    sig_out = os.path.join(output_dir, f"{base_name}_signature.{s_ext}")
    with open(sig_out, "wb") as f:
        f.write(s_bytes)
    print(f"    Saved Signature: {sig_out} ({sw}x{sh} px, {skb} KB)")


def main():
    parser = argparse.ArgumentParser(description="FormExtract Pro - Separate Photo & Signature from Forms")
    parser.add_argument("input", nargs="?", help="Path to input form (PDF/JPG/PNG) or directory when --batch is used")
    parser.add_argument("--batch", action="store_true", help="Process all forms in the input directory")
    parser.add_argument("--output-dir", default="./extracted", help="Directory where extracted images are saved")
    parser.add_argument("--preset", default="custom", choices=["ssc", "upsc", "ibps", "passport", "custom"], help="Portal preset standard")
    parser.add_argument("--sig-mode", default=None, choices=["clean_white", "transparent", "original"], help="Signature background style")
    parser.add_argument("--target-photo-kb", type=int, default=None, help="Target max KB for photo")
    parser.add_argument("--target-sig-kb", type=int, default=None, help="Target max KB for signature")

    args = parser.parse_args()

    if not args.input:
        parser.print_help()
        sys.exit(1)

    config = PRESET_CONFIGS[args.preset].copy()
    if args.sig_mode:
        config["smode"] = args.sig_mode
    if args.target_photo_kb:
        config["pkb"] = args.target_photo_kb
    if args.target_sig_kb:
        config["skb"] = args.target_sig_kb

    extractor = FormExtractor()

    if args.batch:
        if not os.path.isdir(args.input):
            print(f"Error: {args.input} is not a valid directory.")
            sys.exit(1)
        valid_exts = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".bmp"}
        files = [os.path.join(args.input, f) for f in os.listdir(args.input) if os.path.splitext(f)[1].lower() in valid_exts]
        print(f"Found {len(files)} document(s) in {args.input}")
        for f in files:
            try:
                process_single_file(f, args.output_dir, config, extractor)
            except Exception as e:
                print(f"[-] Failed processing {f}: {e}")
    else:
        if not os.path.isfile(args.input):
            print(f"Error: File not found: {args.input}")
            sys.exit(1)
        process_single_file(args.input, args.output_dir, config, extractor)

    print(f"\n[OK] All extractions completed! Output saved to: {os.path.abspath(args.output_dir)}")


if __name__ == "__main__":
    main()
