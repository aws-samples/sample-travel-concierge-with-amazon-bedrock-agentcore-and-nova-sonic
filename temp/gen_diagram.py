"""
Travel Concierge Architecture Diagram
Same format as telephony-ai-host.pptx
"""
import io, os
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn

SRC = '/Users/vatsravi/2026/AnyNewProject/sample-travel-concierge-with-amazon-bedrock-agentcore-and-nova-sonic/telephony-ai-host.pptx'
OUT = '/Users/vatsravi/2026/AnyNewProject/sample-travel-concierge-with-amazon-bedrock-agentcore-and-nova-sonic/travel-concierge-architecture.pptx'
ICON = Inches(0.40)

# ── Load source, extract icon images ─────────────────────────────────────────
src_prs = Presentation(SRC)
src_slide = src_prs.slides[0]

icons = {}  # name -> image bytes
for s in src_slide.shapes:
    if s.shape_type == 13:
        try:
            icons[s.name] = s.image.blob
        except ValueError:
            print(f"  Skipping linked image: {s.name}")

print("Extracted icons:", list(icons.keys()))

# ── Create new presentation with same dimensions ──────────────────────────────
prs = Presentation()
prs.slide_width  = src_prs.slide_width
prs.slide_height = src_prs.slide_height

blank_layout = prs.slide_layouts[6]  # blank
slide = prs.slides.add_slide(blank_layout)

# ── Helpers ───────────────────────────────────────────────────────────────────
def rect(left, top, w, h, fill=None, line=None, lw=Pt(1.25),
         text=None, fs=9, bold=False, tc=None, align=PP_ALIGN.LEFT):
    sh = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, w, h)
    if fill:
        sh.fill.solid(); sh.fill.fore_color.rgb = RGBColor(*fill)
    else:
        sh.fill.background()
    if line:
        sh.line.color.rgb = RGBColor(*line); sh.line.width = lw
    else:
        sh.line.fill.background()
    bp = sh._element.find(qn('p:txBody')).find(qn('a:bodyPr'))
    bp.set('lIns', str(int(Emu(Inches(0.06))))); bp.set('tIns', str(int(Emu(Inches(0.04)))))
    bp.set('anchor', 't')
    if text:
        tf = sh.text_frame; tf.word_wrap = True
        p = tf.paragraphs[0]; p.alignment = align
        r = p.add_run(); r.text = text
        r.font.name = 'Arial'; r.font.size = Pt(fs); r.font.bold = bold
        r.font.color.rgb = RGBColor(*(tc or (0x16,0x19,0x1F)))
    return sh

def tb(left, top, w, h, lines, fs=9, align=PP_ALIGN.CENTER, bold_first=True):
    box = slide.shapes.add_textbox(left, top, w, h)
    tf = box.text_frame; tf.word_wrap = True
    bp = box._element.find(qn('p:txBody')).find(qn('a:bodyPr'))
    for a in ('lIns','tIns','rIns','bIns'): bp.set(a,'0')
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i==0 else tf.add_paragraph()
        p.alignment = align
        r = p.add_run(); r.text = line
        r.font.name = 'Arial'; r.font.size = Pt(fs)
        r.font.bold = (i==0 and bold_first)
        r.font.italic = (i>0)
        r.font.color.rgb = RGBColor(0x16,0x19,0x1F)
    return box

def circle(left, top, num, sz=Inches(0.28)):
    sh = slide.shapes.add_shape(MSO_SHAPE.OVAL, left, top, sz, sz)
    sh.fill.solid(); sh.fill.fore_color.rgb = RGBColor(0x16,0x19,0x1F)
    sh.line.fill.background()
    bp = sh._element.find(qn('p:txBody')).find(qn('a:bodyPr'))
    for a in ('lIns','tIns','rIns','bIns'): bp.set(a,'0')
    bp.set('anchor','ctr')
    p = sh.text_frame.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = str(num)
    r.font.name='Arial'; r.font.size=Pt(9); r.font.bold=True
    r.font.color.rgb = RGBColor(0xFF,0xFF,0xFF)
    return sh

def arrow(x1,y1,x2,y2, col=(0x54,0x57,0x5A), lw=Pt(1.25)):
    c = slide.shapes.add_connector(2, x1,y1,x2,y2)
    c.line.color.rgb = RGBColor(*col); c.line.width = lw
    ln = c._element.find('.//' + qn('a:ln'))
    if ln is None:
        ln = c._element.makeelement(qn('a:ln'),{})
        c._element.append(ln)
    ln.append(ln.makeelement(qn('a:tailEnd'),{'type':'triangle','w':'med','len':'med'}))
    return c

def line(x1,y1,x2,y2, col=(0x54,0x57,0x5A), lw=Pt(1.0)):
    c = slide.shapes.add_connector(1, x1,y1,x2,y2)
    c.line.color.rgb = RGBColor(*col); c.line.width = lw
    return c

def icon(name, left, top):
    if name in icons:
        return slide.shapes.add_picture(io.BytesIO(icons[name]), left, top, ICON, ICON)
    print(f"  MISSING icon: {name}")
    return None

# ── TITLE ─────────────────────────────────────────────────────────────────────
title = slide.shapes.add_textbox(Inches(0.16), Inches(0.05), Inches(9.5), Inches(0.6))
tf = title.text_frame
p = tf.paragraphs[0]
r = p.add_run()
r.text = 'Guidance for Travel Concierge using Amazon Bedrock AgentCore and Nova Sonic 2'
r.font.name='Arial'; r.font.size=Pt(22); r.font.bold=True
r.font.color.rgb = RGBColor(0x16,0x19,0x1F)

desc = slide.shapes.add_textbox(Inches(0.16), Inches(0.68), Inches(9.5), Inches(0.38))
tf = desc.text_frame
p = tf.paragraphs[0]
r = p.add_run()
r.text = 'This architecture diagram shows how to build a voice-enabled airline concierge using Amazon Bedrock AgentCore, Nova Sonic 2, and MCP tool integration.'
r.font.name='Arial'; r.font.size=Pt(11)
r.font.color.rgb = RGBColor(0x16,0x19,0x1F)

# Separator
line(Inches(0.13), Inches(1.08), Inches(9.63), Inches(1.08),
     col=(0x16,0x19,0x1F), lw=Pt(1.0))

# ── SIDEBAR ───────────────────────────────────────────────────────────────────
rect(Inches(9.82), Inches(0), Inches(3.52), Inches(7.5),
     fill=(0xEA,0xED,0xED))

steps = [
    "You open the Travel Concierge web app on AWS Amplify and sign in through Amazon Cognito, which issues a JWT token and temporary AWS credentials via the Identity Pool.",
    "Your browser opens a signed WebSocket to the Amazon Bedrock AgentCore Runtime using SigV4. The Runtime launches a Nova Sonic 2 bidirectional speech-to-speech stream.",
    "The AgentCore Runtime calls four tools in parallel — GetUpcomingItinerary, GetLoyaltyStatus, GetPreferences, and GetFlightStatus — to personalize the greeting before you speak.",
    "The Amazon Bedrock AgentCore Gateway translates MCP tool calls into signed REST requests to Amazon API Gateway, which routes each call to the appropriate AWS Lambda function.",
    "AWS Lambda reads from or writes to Amazon DynamoDB tables covering bookings, passengers, seat maps, loyalty, preferences, and flight status. Email notifications are sent via Amazon SES.",
    "For policy questions, AWS Lambda queries the Amazon Bedrock Knowledge Base, which uses Amazon Titan Embed to perform semantic search over airline policy PDFs stored in Amazon S3.",
    "Nova Sonic 2 streams audio responses back through the WebSocket to your browser. Tool result cards appear in the React UI before the agent speaks.",
    "When you request a live agent, the Runtime calls EscalateToAgent, logs the escalation to DynamoDB, and the frontend displays a call card with the support phone number.",
    "AWS CodeBuild builds the agent container image and pushes it to Amazon ECR. Amazon Bedrock AgentCore Runtime pulls the image and runs the agent. Amazon CloudWatch provides monitoring.",
]

y0 = Inches(0.23)
dy = Inches(0.82)
for i, s in enumerate(steps):
    y = y0 + i*dy
    circle(Inches(10.02), y, i+1)
    stb = slide.shapes.add_textbox(Inches(10.4), y, Inches(2.75), Inches(0.75))
    tf = stb.text_frame; tf.word_wrap = True
    bp = stb._element.find(qn('p:txBody')).find(qn('a:bodyPr'))
    for a in ('lIns','tIns','rIns','bIns'): bp.set(a,'0')
    p = tf.paragraphs[0]
    r = p.add_run(); r.text = s
    r.font.name='Arial'; r.font.size=Pt(8)
    r.font.color.rgb = RGBColor(0x16,0x19,0x1F)

# ── AWS CLOUD BOUNDARY ────────────────────────────────────────────────────────
CL = Inches(1.1); CT = Inches(1.42); CW = Inches(8.55); CH = Inches(5.42)
cloud = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, CL, CT, CW, CH)
cloud.fill.background()
cloud.line.color.rgb = RGBColor(0x16,0x19,0x1F); cloud.line.width = Pt(1.5)
cloud.text_frame.text = ''
tb(Inches(1.63), Inches(1.42), Inches(1.2), Inches(0.3),
   ['AWS Cloud'], fs=12, align=PP_ALIGN.LEFT)

# AWS Cloud group icon (from source: Graphic 78)
icon('Graphic 78', CL, CT)

# ── SECTION BOXES ─────────────────────────────────────────────────────────────
# Row 1 (y=1.83): Auth | Voice AI Agent | AgentCore
rect(Inches(1.23), Inches(1.83), Inches(1.62), Inches(1.83),
     fill=(0xE8,0xF4,0xFD), line=(0xB0,0xD4,0xF1),
     text='Authentication', fs=8, bold=True)

rect(Inches(2.96), Inches(1.83), Inches(2.65), Inches(1.83),
     fill=(0xF0,0xF8,0xF0), line=(0x82,0xD4,0xA8),
     text='Voice AI Agent', fs=8, bold=True)

rect(Inches(5.72), Inches(1.83), Inches(3.73), Inches(1.83),
     fill=(0xE2,0xF5,0xF2), line=(0x01,0xA8,0x8D),
     text='AgentCore Gateway', fs=8, bold=True)

# Row 2 (y=3.86): MCP Gateway | API & Compute | Data | KB
rect(Inches(1.25), Inches(3.86), Inches(2.01), Inches(1.44),
     fill=(0xE8,0xF0,0xFD), line=(0x82,0xA8,0xE0),
     text='MCP Gateway', fs=8, bold=True)

rect(Inches(3.42), Inches(3.87), Inches(2.57), Inches(1.43),
     fill=(0xFD,0xF0,0xE2), line=(0xED,0xBB,0x82),
     text='API & Compute', fs=8, bold=True)

rect(Inches(6.05), Inches(3.86), Inches(1.58), Inches(1.44),
     fill=(0xE8,0xF0,0xE2), line=(0x1B,0x66,0x0F),
     text='Data Storage', fs=8, bold=True)

rect(Inches(7.67), Inches(3.85), Inches(1.78), Inches(1.44),
     fill=(0xFD,0xF0,0xE2), line=(0xED,0xBB,0x82),
     text='Knowledge Base', fs=8, bold=True)

# Row 3 (y=5.49): Build Pipeline | Monitoring
rect(Inches(2.77), Inches(5.49), Inches(3.8), Inches(1.16),
     fill=(0xF0,0xF0,0xF0), line=(0xC0,0xC0,0xC0),
     text='Build Pipeline', fs=8, bold=True)

rect(Inches(6.83), Inches(5.49), Inches(2.7), Inches(1.16),
     fill=(0xF5,0xE8,0xF0), line=(0xE7,0x15,0x7B),
     text='Monitoring', fs=8, bold=True)

# ── ICONS + LABELS ────────────────────────────────────────────────────────────
# User (outside cloud boundary)
icon('Graphic 23', Inches(0.31), Inches(2.89))  # Users icon
tb(Inches(0.05), Inches(3.35), Inches(1.1), Inches(0.3),
   ['Users'], fs=9, align=PP_ALIGN.CENTER, bold_first=True)

# Amplify (Auth section) - use CDK icon as placeholder, label Amplify
icon('Picture 170', Inches(1.49), Inches(2.02))  # CDK icon reused
tb(Inches(1.14), Inches(2.45), Inches(1.1), Inches(0.3),
   ['AWS Amplify'], fs=9, align=PP_ALIGN.CENTER)

# Cognito (Auth section)
icon('Graphic 17', Inches(1.49), Inches(2.9))  # Chime icon reused for Cognito
tb(Inches(1.14), Inches(3.35), Inches(1.1), Inches(0.3),
   ['Amazon Cognito'], fs=9, align=PP_ALIGN.CENTER)

# AgentCore Runtime (Voice AI Agent section)
icon('Graphic 89', Inches(3.59), Inches(2.02))
tb(Inches(3.24), Inches(2.45), Inches(1.1), Inches(0.3),
   ['AgentCore', 'Runtime'], fs=9, align=PP_ALIGN.CENTER)

# Nova Sonic (Voice AI Agent section)
icon('Graphic 92', Inches(4.77), Inches(2.02))
tb(Inches(4.42), Inches(2.45), Inches(1.1), Inches(0.3),
   ['Amazon Bedrock', 'Nova Sonic 2'], fs=9, align=PP_ALIGN.CENTER)

# AgentCore Gateway (AgentCore Gateway section)
icon('Graphic 97', Inches(6.21), Inches(2.02))
tb(Inches(5.86), Inches(2.45), Inches(1.1), Inches(0.3),
   ['AgentCore', 'Gateway'], fs=9, align=PP_ALIGN.CENTER)

# API Gateway (API & Compute section)
icon('Graphic 7', Inches(3.97), Inches(4.3))
tb(Inches(3.62), Inches(4.73), Inches(1.1), Inches(0.3),
   ['Amazon API', 'Gateway'], fs=9, align=PP_ALIGN.CENTER)

# Lambda (API & Compute section)
icon('Graphic 10', Inches(5.24), Inches(4.3))
tb(Inches(4.89), Inches(4.73), Inches(1.1), Inches(0.3),
   ['AWS Lambda'], fs=9, align=PP_ALIGN.CENTER)

# DynamoDB (Data Storage section)
icon('Graphic 23', Inches(6.24), Inches(4.3))
tb(Inches(5.89), Inches(4.73), Inches(1.1), Inches(0.3),
   ['Amazon', 'DynamoDB'], fs=9, align=PP_ALIGN.CENTER)

# Bedrock KB (Knowledge Base section)
icon('Graphic 89', Inches(7.77), Inches(4.3))  # reuse AgentCore icon
tb(Inches(7.42), Inches(4.73), Inches(1.1), Inches(0.3),
   ['Amazon Bedrock', 'Knowledge Base'], fs=9, align=PP_ALIGN.CENTER)

# S3 (Build Pipeline section)
icon('Graphic 8', Inches(3.15), Inches(5.94))
tb(Inches(2.8), Inches(6.37), Inches(1.1), Inches(0.25),
   ['Amazon S3'], fs=9, align=PP_ALIGN.CENTER)

# CodeBuild (Build Pipeline section)
icon('Graphic 19', Inches(4.47), Inches(5.92))
tb(Inches(4.12), Inches(6.37), Inches(1.1), Inches(0.25),
   ['AWS CodeBuild'], fs=9, align=PP_ALIGN.CENTER)

# ECR (Build Pipeline section)
icon('Graphic 20', Inches(5.77), Inches(5.92))
tb(Inches(5.42), Inches(6.37), Inches(1.1), Inches(0.25),
   ['Amazon ECR'], fs=9, align=PP_ALIGN.CENTER)

# CloudWatch (Monitoring section)
icon('Picture 150', Inches(7.43), Inches(5.92))
tb(Inches(7.08), Inches(6.37), Inches(1.1), Inches(0.25),
   ['Amazon', 'CloudWatch'], fs=9, align=PP_ALIGN.CENTER)

# SES (Monitoring section - reuse)
icon('Graphic 109', Inches(8.58), Inches(5.92))
tb(Inches(8.23), Inches(6.37), Inches(1.1), Inches(0.25),
   ['Amazon SES'], fs=9, align=PP_ALIGN.CENTER)

# ── ARROWS ────────────────────────────────────────────────────────────────────
# User → Amplify
arrow(Inches(0.71), Inches(3.09), Inches(1.49), Inches(2.22))

# Amplify → Cognito
arrow(Inches(1.69), Inches(2.42), Inches(1.69), Inches(2.9))

# Cognito → AgentCore Runtime (WebSocket)
arrow(Inches(2.85), Inches(3.1), Inches(3.59), Inches(2.22))

# AgentCore Runtime → Nova Sonic
arrow(Inches(3.99), Inches(2.22), Inches(4.77), Inches(2.22))

# AgentCore Runtime → AgentCore Gateway
arrow(Inches(4.77), Inches(2.22), Inches(6.21), Inches(2.22))

# AgentCore Gateway → API Gateway
arrow(Inches(6.61), Inches(3.65), Inches(4.37), Inches(4.3))

# API Gateway → Lambda
arrow(Inches(4.37), Inches(4.5), Inches(5.24), Inches(4.5))

# Lambda → DynamoDB
arrow(Inches(5.64), Inches(4.5), Inches(6.24), Inches(4.5))

# Lambda → Knowledge Base
arrow(Inches(5.64), Inches(4.3), Inches(7.77), Inches(4.3))

# S3 → CodeBuild → ECR (build pipeline)
arrow(Inches(3.55), Inches(6.12), Inches(4.47), Inches(6.12))
arrow(Inches(4.87), Inches(6.12), Inches(5.77), Inches(6.12))

# ── NUMBERED CALLOUTS ─────────────────────────────────────────────────────────
circle(Inches(0.76), Inches(2.75), 1)   # User → Amplify
circle(Inches(1.38), Inches(2.14), 2)   # Cognito auth
circle(Inches(2.48), Inches(3.24), 3)   # WebSocket to Runtime
circle(Inches(4.05), Inches(2.67), 4)   # Parallel tool calls
circle(Inches(5.12), Inches(2.38), 5)   # Gateway → API GW
circle(Inches(3.57), Inches(4.01), 6)   # API GW → Lambda
circle(Inches(5.64), Inches(4.01), 7)   # Lambda → DynamoDB
circle(Inches(7.26), Inches(3.93), 8)   # Lambda → KB
circle(Inches(2.42), Inches(5.55), 9)   # Build pipeline

# ── SAVE ──────────────────────────────────────────────────────────────────────
prs.save(OUT)
print(f"\nSaved: {OUT}")
print("Done!")
