"""
Travel Concierge Architecture Diagram
SAME visual format as telephony-ai-host.pptx:
  - Title + description + separator
  - Grey sidebar with numbered steps
  - AWS Cloud boundary
  - Section boxes with colored fills
  - Icons 0.40" x 0.40"

Layout (matching telephony structure):
  Row 1 (y=1.83): [Customer: Cognito+Browser] [AgentCore: NovaSonic+Runtime+Gateway] [Backend top: KB+NovaSonic]
  Row 2 (y=3.86): [API Gateway] [Lambda] [DynamoDB]
  Row 3 (y=5.49): [Build Pipeline] [Monitoring]

Arrows match flow-visualizer.html exactly.
"""
import io, os
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn

SRC  = '/Users/vatsravi/2026/AnyNewProject/sample-travel-concierge-with-amazon-bedrock-agentcore-and-nova-sonic/telephony-ai-host.pptx'
IMGS = '/Users/vatsravi/2026/AnyNewProject/sample-travel-concierge-with-amazon-bedrock-agentcore-and-nova-sonic/temp/png_icons'
OUT  = '/Users/vatsravi/2026/AnyNewProject/sample-travel-concierge-with-amazon-bedrock-agentcore-and-nova-sonic/travel-concierge-architecture.pptx'
ICON = Inches(0.40)

IMG = {
    'cloud_group': 'image2.png',
    'agentcore':   'image3.png',
    'nova_sonic':  'image4.png',
    'api_gateway': 'image5.png',
    'lambda':      'image6.png',
    'dynamodb':    'image7.png',
    's3':          'image9.png',
    'codebuild':   'image10.png',
    'ecr':         'image11.png',
    'cloudwatch':  'image13.png',
    'amplify':     'image15.png',
    'cognito':     'image16.png',
    'users':       'image18.png',
    'bedrock_kb':  'image19.png',
    'ses':         'image8.png',
    'nova_lite':   'image4.png',
}

def img_path(k): return os.path.join(IMGS, IMG[k])

src_prs = Presentation(SRC)
prs = Presentation()
prs.slide_width  = src_prs.slide_width
prs.slide_height = src_prs.slide_height
slide = prs.slides.add_slide(prs.slide_layouts[6])

# ── Helpers ───────────────────────────────────────────────────────────────────
def rect(l,t,w,h, fill=None, line=None, lw=Pt(1.25),
         text=None, fs=8, bold=False, tc=None, align=PP_ALIGN.LEFT):
    sh = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, l,t,w,h)
    if fill: sh.fill.solid(); sh.fill.fore_color.rgb=RGBColor(*fill)
    else: sh.fill.background()
    if line: sh.line.color.rgb=RGBColor(*line); sh.line.width=lw
    else: sh.line.fill.background()
    bp=sh._element.find(qn('p:txBody')).find(qn('a:bodyPr'))
    bp.set('lIns',str(int(Emu(Inches(0.06))))); bp.set('tIns',str(int(Emu(Inches(0.04)))))
    bp.set('anchor','t')
    if text:
        tf=sh.text_frame; tf.word_wrap=True
        p=tf.paragraphs[0]; p.alignment=align
        r=p.add_run(); r.text=text
        r.font.name='Arial'; r.font.size=Pt(fs); r.font.bold=bold
        r.font.color.rgb=RGBColor(*(tc or (0x16,0x19,0x1F)))
    return sh

def tb(l,t,w,h, lines, fs=9, align=PP_ALIGN.CENTER, bold_first=True):
    box=slide.shapes.add_textbox(l,t,w,h)
    tf=box.text_frame; tf.word_wrap=True
    bp=box._element.find(qn('p:txBody')).find(qn('a:bodyPr'))
    for a in ('lIns','tIns','rIns','bIns'): bp.set(a,'0')
    for i,lt in enumerate(lines):
        p=tf.paragraphs[0] if i==0 else tf.add_paragraph()
        p.alignment=align
        r=p.add_run(); r.text=lt
        r.font.name='Arial'; r.font.size=Pt(fs)
        r.font.bold=(i==0 and bold_first); r.font.italic=(i>0)
        r.font.color.rgb=RGBColor(0x16,0x19,0x1F)
    return box

def circle(l,t,num,sz=Inches(0.28)):
    sh=slide.shapes.add_shape(MSO_SHAPE.OVAL,l,t,sz,sz)
    sh.fill.solid(); sh.fill.fore_color.rgb=RGBColor(0x16,0x19,0x1F)
    sh.line.fill.background()
    bp=sh._element.find(qn('p:txBody')).find(qn('a:bodyPr'))
    for a in ('lIns','tIns','rIns','bIns'): bp.set(a,'0')
    bp.set('anchor','ctr')
    p=sh.text_frame.paragraphs[0]; p.alignment=PP_ALIGN.CENTER
    r=p.add_run(); r.text=str(num)
    r.font.name='Arial'; r.font.size=Pt(9); r.font.bold=True
    r.font.color.rgb=RGBColor(0xFF,0xFF,0xFF)
    return sh

def arrow(x1,y1,x2,y2, col=(0x54,0x57,0x5A), lw=Pt(1.25)):
    c=slide.shapes.add_connector(2,x1,y1,x2,y2)
    c.line.color.rgb=RGBColor(*col); c.line.width=lw
    ln=c._element.find('.//' + qn('a:ln'))
    if ln is None:
        ln=c._element.makeelement(qn('a:ln'),{}); c._element.append(ln)
    ln.append(ln.makeelement(qn('a:tailEnd'),{'type':'triangle','w':'med','len':'med'}))
    return c

def hline(x1,y1,x2,y2, col=(0x16,0x19,0x1F), lw=Pt(1.0)):
    c=slide.shapes.add_connector(1,x1,y1,x2,y2)
    c.line.color.rgb=RGBColor(*col); c.line.width=lw
    return c

def icon(k,l,t):
    p=img_path(k)
    if os.path.exists(p): return slide.shapes.add_picture(p,l,t,ICON,ICON)
    print(f"  MISSING: {p}"); return None

# Edge midpoints
def ir(x,y): return (x+ICON, y+ICON/2)
def il(x,y): return (x,      y+ICON/2)
def ib(x,y): return (x+ICON/2, y+ICON)
def it(x,y): return (x+ICON/2, y)

# ═══════════════════════════════════════════════════════════════════════════════
# ICON POSITIONS  (x, y) = top-left corner
#
# Row 1 (y_icon=2.02):
#   Cognito:    x=1.49   (Customer section)
#   Browser:    x=1.49   y=2.90  (Customer section, below Cognito)
#   NovaSonic:  x=3.19   (AgentCore section, top)
#   Runtime:    x=4.37   (AgentCore section, middle)
#   Gateway:    x=5.55   (AgentCore section, right)
#   KB:         x=6.90   (Backend section, top-left)
#   NoveLite:   x=8.10   (Backend section, top-right)
#
# Row 2 (y_icon=4.30):
#   APIGW:      x=6.00
#   Lambda:     x=7.20
#   DynamoDB:   x=8.40
#
# Row 3 (y_icon=5.92):
#   S3:         x=3.15
#   CodeBuild:  x=4.47
#   ECR:        x=5.77
#   CloudWatch: x=7.43
#   SES:        x=8.58
#
# Outside cloud (Users):
#   x=0.31, y=2.89
# ═══════════════════════════════════════════════════════════════════════════════

# ── TITLE ─────────────────────────────────────────────────────────────────────
t=slide.shapes.add_textbox(Inches(0.16),Inches(0.05),Inches(9.5),Inches(0.6))
tf=t.text_frame; p=tf.paragraphs[0]; r=p.add_run()
r.text='Guidance for Travel Concierge using Amazon Bedrock AgentCore and Nova Sonic 2'
r.font.name='Arial'; r.font.size=Pt(22); r.font.bold=True
r.font.color.rgb=RGBColor(0x16,0x19,0x1F)

d=slide.shapes.add_textbox(Inches(0.16),Inches(0.68),Inches(9.5),Inches(0.38))
tf=d.text_frame; p=tf.paragraphs[0]; r=p.add_run()
r.text='This architecture diagram shows how to build a voice-enabled airline concierge using Amazon Bedrock AgentCore, Nova Sonic 2, and MCP tool integration.'
r.font.name='Arial'; r.font.size=Pt(11)
r.font.color.rgb=RGBColor(0x16,0x19,0x1F)

hline(Inches(0.13),Inches(1.08),Inches(9.63),Inches(1.08))

# ── SIDEBAR ───────────────────────────────────────────────────────────────────
rect(Inches(9.82),Inches(0),Inches(3.52),Inches(7.5),fill=(0xEA,0xED,0xED))

steps=[
    "You open the Travel Concierge web app and sign in through Amazon Cognito, which issues a JWT token and temporary AWS credentials via the Identity Pool.",
    "Your browser opens a signed WebSocket to the Amazon Bedrock AgentCore Runtime using SigV4. The Runtime launches a Nova Sonic 2 bidirectional speech-to-speech stream.",
    "The AgentCore Runtime calls four tools in parallel — GetUpcomingItinerary, GetLoyaltyStatus, GetPreferences, and GetFlightStatus — to personalize the greeting.",
    "The Amazon Bedrock AgentCore Gateway translates MCP tool calls into signed REST requests to Amazon API Gateway, routing each call to the appropriate AWS Lambda function.",
    "AWS Lambda reads from or writes to Amazon DynamoDB tables covering bookings, passengers, seat maps, loyalty, preferences, and flight status.",
    "For policy questions, AWS Lambda queries the Amazon Bedrock Knowledge Base. Nova Lite generates a natural language answer from the retrieved policy documents.",
    "Nova Sonic 2 streams audio responses back through the WebSocket to your browser. Tool result cards appear in the React UI before the agent speaks.",
    "When you request a live agent, the Runtime calls EscalateToAgent, logs the escalation to DynamoDB, and the frontend displays a call card with the support phone number.",
    "AWS CodeBuild builds the agent container image and pushes it to Amazon ECR. AgentCore Runtime pulls the image and runs the agent. Amazon CloudWatch provides monitoring.",
]
y0=Inches(0.23); dy=Inches(0.82)
for i,s in enumerate(steps):
    y=y0+i*dy
    circle(Inches(10.02),y,i+1)
    stb=slide.shapes.add_textbox(Inches(10.4),y,Inches(2.75),Inches(0.75))
    tf=stb.text_frame; tf.word_wrap=True
    bp=stb._element.find(qn('p:txBody')).find(qn('a:bodyPr'))
    for a in ('lIns','tIns','rIns','bIns'): bp.set(a,'0')
    p=tf.paragraphs[0]; r=p.add_run(); r.text=s
    r.font.name='Arial'; r.font.size=Pt(8)
    r.font.color.rgb=RGBColor(0x16,0x19,0x1F)

# ── AWS CLOUD BOUNDARY ────────────────────────────────────────────────────────
CL=Inches(1.1); CT=Inches(1.42); CW=Inches(8.55); CH=Inches(5.42)
cloud=slide.shapes.add_shape(MSO_SHAPE.RECTANGLE,CL,CT,CW,CH)
cloud.fill.background()
cloud.line.color.rgb=RGBColor(0x16,0x19,0x1F); cloud.line.width=Pt(1.5)
cloud.text_frame.text=''
icon('cloud_group',CL,CT)
tb(Inches(1.63),Inches(1.42),Inches(1.2),Inches(0.3),['AWS Cloud'],fs=12,align=PP_ALIGN.LEFT)

# ── SECTION BOXES ─────────────────────────────────────────────────────────────
# Row 1 sections
rect(Inches(1.23),Inches(1.83),Inches(1.62),Inches(2.83),   # Customer (taller — has Cognito+Browser)
     fill=(0xE8,0xF4,0xFD),line=(0xB0,0xD4,0xF1),text='Customer',bold=True)
rect(Inches(2.96),Inches(1.83),Inches(3.23),Inches(1.83),   # AgentCore (NovaSonic+Runtime+Gateway)
     fill=(0xF0,0xF8,0xF0),line=(0x82,0xD4,0xA8),text='Bedrock AgentCore',bold=True)
rect(Inches(6.30),Inches(1.83),Inches(3.15),Inches(1.83),   # Backend top (KB+NoveLite)
     fill=(0xE2,0xF5,0xF2),line=(0x01,0xA8,0x8D),text='Backend',bold=True)

# Row 2 section (API+Lambda+DDB)
rect(Inches(5.90),Inches(3.86),Inches(3.55),Inches(1.44),
     fill=(0xFD,0xF0,0xE2),line=(0xED,0xBB,0x82),text='API & Compute + Data',bold=True)

# Row 3 sections
rect(Inches(2.77),Inches(5.49),Inches(3.8),Inches(1.16),
     fill=(0xF0,0xF0,0xF0),line=(0xC0,0xC0,0xC0),text='Build Pipeline',bold=True)
rect(Inches(6.83),Inches(5.49),Inches(2.7),Inches(1.16),
     fill=(0xF5,0xE8,0xF0),line=(0xE7,0x15,0x7B),text='Monitoring',bold=True)

# ── ICONS + LABELS ────────────────────────────────────────────────────────────
# Outside cloud — Users
icon('users',Inches(0.31),Inches(2.89))
tb(Inches(0.05),Inches(3.35),Inches(1.1),Inches(0.3),['Users'],fs=9)

# Customer section
icon('cognito',Inches(1.49),Inches(2.02))
tb(Inches(1.14),Inches(2.45),Inches(1.1),Inches(0.3),['Amazon Cognito','JWT + Identity Pool'],fs=9)

icon('amplify',Inches(1.49),Inches(2.90))
tb(Inches(1.14),Inches(3.35),Inches(1.1),Inches(0.3),['Browser / App','React + WebSocket'],fs=9)

# AgentCore section — Nova Sonic (top), Runtime (middle), Gateway (right)
icon('nova_sonic',Inches(3.19),Inches(2.02))
tb(Inches(2.84),Inches(2.45),Inches(1.1),Inches(0.3),['Nova Sonic 2','speech-to-speech'],fs=9)

icon('agentcore',Inches(4.37),Inches(2.02))
tb(Inches(4.02),Inches(2.45),Inches(1.1),Inches(0.3),['AgentCore Runtime','Strands BidiAgent'],fs=9)

icon('agentcore',Inches(5.55),Inches(2.02))
tb(Inches(5.20),Inches(2.45),Inches(1.1),Inches(0.3),['AgentCore Gateway','MCP protocol'],fs=9)

# Backend top — KB (left), Nova Lite (right)
icon('bedrock_kb',Inches(6.50),Inches(2.02))
tb(Inches(6.15),Inches(2.45),Inches(1.1),Inches(0.3),['Knowledge Base','Bedrock + vector'],fs=9)

icon('nova_lite',Inches(7.90),Inches(2.02))
tb(Inches(7.55),Inches(2.45),Inches(1.1),Inches(0.3),['Nova Lite','KB gen model'],fs=9)

# Row 2 — API GW, Lambda, DynamoDB
icon('api_gateway',Inches(6.00),Inches(4.30))
tb(Inches(5.65),Inches(4.73),Inches(1.1),Inches(0.3),['API Gateway','REST + AWS_IAM'],fs=9)

icon('lambda',Inches(7.20),Inches(4.30))
tb(Inches(6.85),Inches(4.73),Inches(1.1),Inches(0.3),['Backend Lambdas','18 functions'],fs=9)

icon('dynamodb',Inches(8.40),Inches(4.30))
tb(Inches(8.05),Inches(4.73),Inches(1.1),Inches(0.3),['DynamoDB','Bookings, Seats'],fs=9)

# Row 3 — Build Pipeline
icon('s3',Inches(3.15),Inches(5.92))
tb(Inches(2.80),Inches(6.37),Inches(1.1),Inches(0.25),['Amazon S3'],fs=9)

icon('codebuild',Inches(4.47),Inches(5.92))
tb(Inches(4.12),Inches(6.37),Inches(1.1),Inches(0.25),['AWS CodeBuild'],fs=9)

icon('ecr',Inches(5.77),Inches(5.92))
tb(Inches(5.42),Inches(6.37),Inches(1.1),Inches(0.25),['Amazon ECR'],fs=9)

# Row 3 — Monitoring
icon('cloudwatch',Inches(7.43),Inches(5.92))
tb(Inches(7.08),Inches(6.37),Inches(1.1),Inches(0.25),['Amazon CloudWatch'],fs=9)

icon('ses',Inches(8.58),Inches(5.92))
tb(Inches(8.23),Inches(6.37),Inches(1.1),Inches(0.25),['Amazon SES'],fs=9)

# ── ARROWS (matching flow-visualizer exactly) ─────────────────────────────────
# Users → Browser (horizontal right)
arrow(*ir(Inches(0.31),Inches(2.89)), *il(Inches(1.49),Inches(2.90)))

# Cognito ↕ Browser (vertical bidirectional)
arrow(*ib(Inches(1.49),Inches(2.02)), *it(Inches(1.49),Inches(2.90)))   # Cognito → Browser
arrow(Inches(1.69),Inches(2.90), Inches(1.69),Inches(2.42))             # Browser → Cognito

# Browser ↔ AgentCore Runtime (horizontal bidirectional)
arrow(*ir(Inches(1.49),Inches(2.90)), *il(Inches(4.37),Inches(2.02)))   # Browser → Runtime (WSS in)
arrow(Inches(4.37),Inches(2.32), Inches(1.89),Inches(2.90+ICON/2))      # Runtime → Browser (audio out)

# Nova Sonic ↕ AgentCore Runtime (vertical bidirectional)
arrow(*ir(Inches(3.19),Inches(2.02)), *il(Inches(4.37),Inches(2.02)))   # NovaSonic → Runtime (audio out)
arrow(Inches(4.37),Inches(2.12), Inches(3.59),Inches(2.12))             # Runtime → NovaSonic (audio in)

# AgentCore Runtime → AgentCore Gateway (horizontal right)
arrow(*ir(Inches(4.37),Inches(2.02)), *il(Inches(5.55),Inches(2.02)))

# AgentCore Gateway → API Gateway (vertical down then horizontal — elbow)
arrow(*ib(Inches(5.55),Inches(2.02)), *it(Inches(6.00),Inches(4.30)))

# API Gateway ← AgentCore Gateway return (offset)
arrow(*it(Inches(6.20),Inches(4.30)), Inches(5.75),Inches(2.42))

# API Gateway → Lambda (horizontal right)
arrow(*ir(Inches(6.00),Inches(4.30)), *il(Inches(7.20),Inches(4.30)))

# Lambda → API Gateway return (offset)
arrow(Inches(7.20),Inches(4.50), Inches(6.40),Inches(4.50))

# Lambda → DynamoDB (horizontal right)
arrow(*ir(Inches(7.20),Inches(4.30)), *il(Inches(8.40),Inches(4.30)))

# Lambda ↑ Knowledge Base (vertical up)
arrow(*it(Inches(7.20),Inches(4.30)), *ib(Inches(6.70),Inches(2.02)))

# Knowledge Base ↔ Nova Lite (horizontal bidirectional)
arrow(*ir(Inches(6.50),Inches(2.02)), *il(Inches(7.90),Inches(2.02)))   # KB → Nova Lite
arrow(Inches(7.90),Inches(2.22), Inches(6.90),Inches(2.22))             # Nova Lite → KB

# Knowledge Base → Lambda return (vertical down, offset)
arrow(Inches(6.70),Inches(2.42), Inches(7.40),Inches(4.30))

# Build pipeline: S3 → CodeBuild → ECR
arrow(*ir(Inches(3.15),Inches(5.92)), *il(Inches(4.47),Inches(5.92)))
arrow(*ir(Inches(4.47),Inches(5.92)), *il(Inches(5.77),Inches(5.92)))

# ECR ↑ AgentCore Runtime (vertical up)
arrow(*it(Inches(5.77),Inches(5.92)), *ib(Inches(4.57),Inches(2.02)))

# Browser → Live Agent (escalation — shown as text label, no separate icon needed)
# Add a small note instead
tb(Inches(1.14),Inches(4.60),Inches(1.5),Inches(0.3),
   ['→ Live Agent (escalation)'],fs=8,align=PP_ALIGN.LEFT,bold_first=False)

# ── NUMBERED CALLOUTS ─────────────────────────────────────────────────────────
circle(Inches(0.76),Inches(2.75),1)    # Users → Browser
circle(Inches(1.38),Inches(2.14),2)    # Cognito ↕ Browser
circle(Inches(2.48),Inches(2.14),3)    # Browser → Runtime (WebSocket)
circle(Inches(3.99),Inches(1.88),4)    # Runtime ↔ Nova Sonic
circle(Inches(5.12),Inches(1.88),5)    # Runtime → Gateway
circle(Inches(5.55),Inches(3.24),6)    # Gateway → API GW
circle(Inches(6.85),Inches(4.01),7)    # API GW → Lambda → DDB
circle(Inches(6.50),Inches(1.88),8)    # Lambda ↑ KB ↔ Nova Lite
circle(Inches(2.42),Inches(5.55),9)    # Build pipeline

# ── SAVE ──────────────────────────────────────────────────────────────────────
prs.save(OUT)
print(f"\nSaved: {OUT}")

prs2=Presentation(OUT)
bad=[f"{s.name}:{s.width/914400:.2f}x{s.height/914400:.2f}"
     for s in prs2.slides[0].shapes if s.shape_type==13
     and (abs(s.width/914400-0.40)>0.01 or abs(s.height/914400-0.40)>0.01)]
print("Icon size issues:",bad if bad else "none ✓")
print("Done!")
