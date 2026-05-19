"""Map shape names to image files - handle SVG blip with different namespace."""
import zipfile
from lxml import etree

SRC = '/Users/vatsravi/2026/AnyNewProject/sample-travel-concierge-with-amazon-bedrock-agentcore-and-nova-sonic/telephony-ai-host.pptx'
ICONS_DIR = '/Users/vatsravi/2026/AnyNewProject/sample-travel-concierge-with-amazon-bedrock-agentcore-and-nova-sonic/temp/extracted_icons'

with zipfile.ZipFile(SRC, 'r') as z:
    rels_xml = z.read('ppt/slides/_rels/slide1.xml.rels')
    rels_root = etree.fromstring(rels_xml)
    ns_r = 'http://schemas.openxmlformats.org/package/2006/relationships'
    rid_to_file = {}
    for rel in rels_root.findall(f'{{{ns_r}}}Relationship'):
        rid = rel.get('Id')
        target = rel.get('Target')
        if 'media' in target:
            rid_to_file[rid] = target.split('/')[-1]
    
    slide_xml = z.read('ppt/slides/slide1.xml')
    slide_root = etree.fromstring(slide_xml)
    
    # Print raw XML of first Graphic pic to understand structure
    pics = list(slide_root.iter('{http://schemas.openxmlformats.org/presentationml/2006/main}pic'))
    if pics:
        print("First pic XML:")
        print(etree.tostring(pics[0], pretty_print=True).decode()[:2000])
        print()
    
    # Try finding all r:embed and r:link attributes anywhere
    print("All rId references in slide:")
    r_ns = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    for elem in slide_root.iter():
        for attr_name, attr_val in elem.attrib.items():
            if 'embed' in attr_name or 'link' in attr_name:
                img_file = rid_to_file.get(attr_val, 'NOT FOUND')
                # Find parent pic name
                parent = elem
                name = 'unknown'
                for _ in range(10):
                    cNvPr = parent.find('.//{http://schemas.openxmlformats.org/presentationml/2006/main}cNvPr')
                    if cNvPr is None:
                        cNvPr = parent.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}cNvPr')
                    if cNvPr is not None:
                        name = cNvPr.get('name', 'unknown')
                        break
                    parent = parent.getparent()
                    if parent is None:
                        break
                print(f"  attr={attr_name!r} rId={attr_val!r} → {img_file} (shape: {name!r})")
