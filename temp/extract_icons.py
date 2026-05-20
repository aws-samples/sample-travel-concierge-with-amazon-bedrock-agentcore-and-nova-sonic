"""Extract all images from the telephony PPTX including linked ones."""
import zipfile, os, shutil

SRC = '/Users/vatsravi/2026/AnyNewProject/sample-travel-concierge-with-amazon-bedrock-agentcore-and-nova-sonic/telephony-ai-host.pptx'
OUT_DIR = '/Users/vatsravi/2026/AnyNewProject/sample-travel-concierge-with-amazon-bedrock-agentcore-and-nova-sonic/temp/extracted_icons'

os.makedirs(OUT_DIR, exist_ok=True)

# PPTX is a ZIP file
with zipfile.ZipFile(SRC, 'r') as z:
    # List all files
    all_files = z.namelist()
    print("All files in PPTX:")
    for f in sorted(all_files):
        print(f"  {f}")
    
    # Extract all media files
    media_files = [f for f in all_files if f.startswith('ppt/media/')]
    print(f"\nMedia files ({len(media_files)}):")
    for f in media_files:
        fname = os.path.basename(f)
        out_path = os.path.join(OUT_DIR, fname)
        with z.open(f) as src, open(out_path, 'wb') as dst:
            dst.write(src.read())
        print(f"  Extracted: {fname}")
    
    # Also check slide relationships to map shape names to media files
    rels_file = 'ppt/slides/_rels/slide1.xml.rels'
    if rels_file in all_files:
        print(f"\nSlide relationships:")
        with z.open(rels_file) as f:
            content = f.read().decode('utf-8')
            print(content)
