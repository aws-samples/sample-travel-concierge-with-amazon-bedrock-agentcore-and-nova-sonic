"""Map shape names to image files via relationships."""
import zipfile
from lxml import etree

SRC = '/Users/vatsravi/2026/AnyNewProject/sample-travel-concierge-with-amazon-bedrock-agentcore-and-nova-sonic/telephony-ai-host.pptx'

with zipfile.ZipFile(SRC, 'r') as z:
    # Parse relationships
    rels_xml = z.read('ppt/slides/_rels/slide1.xml.rels')
    rels_root = etree.fromstring(rels_xml)
    ns = {'r': 'http://schemas.openxmlformats.org/package/2006/relationships'}
    rid_to_file = {}
    for rel in rels_root.findall('r:Relationship', ns):
        rid = rel.get('Id')
        target = rel.get('Target')
        if 'media' in target:
            fname = target.split('/')[-1]
            rid_to_file[rid] = fname
    
    # Parse slide XML to find pic shapes and their rIds
    slide_xml = z.read('ppt/slides/slide1.xml')
    slide_root = etree.fromstring(slide_xml)
    
    # Namespaces
    nsmap = {
        'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
        'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
        'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        'p14': 'http://schemas.microsoft.com/office/powerpoint/2010/main',
    }
    
    print("Shape name → image file mapping:")
    # Find all pic elements
    for pic in slide_root.iter('{http://schemas.openxmlformats.org/presentationml/2006/main}pic'):
        # Get name from nvPicPr/cNvPr
        cNvPr = pic.find('.//{http://schemas.openxmlformats.org/presentationml/2006/main}cNvPr')
        if cNvPr is None:
            cNvPr = pic.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}cNvPr')
        
        name = cNvPr.get('name') if cNvPr is not None else 'unknown'
        
        # Get rId from blipFill/blip
        blip = pic.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}blip')
        if blip is not None:
            rid = blip.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
            img_file = rid_to_file.get(rid, 'NOT FOUND')
            print(f"  {name!r} → rId={rid} → {img_file}")
