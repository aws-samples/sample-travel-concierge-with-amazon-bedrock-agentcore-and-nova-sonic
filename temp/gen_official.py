"""
Travel Concierge Architecture Diagram
Exact copy of the official AWS Reference Architecture format from the screenshot.

Layout matches "Guidance for Voice AI In-App Ordering" diagram:
  Row 1: [Frontend & Auth: Cognito+Amplify] [Agent Runtime: AgentCore Runtime] [AI/ML: Nova Sonic 2]
  Row 2: [MCP Gateway: AgentCore GW] [API & Compute: APIGW+Lambda] [Data Storage: DDB] [Knowledge Base: KB+NoveLite]
  Row 3: [Build Pipeline: CDK+S3+CodeBuild+ECR] [Security & Monitoring: KMS+CloudWatch]

Sidebar: 10 numbered steps with bold service names (matching the screenshot style)
Footer: AWS logo + "AWS Reference Architecture"
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
    'cdk':         'image15.png',
    'kms':         'image14.png',
}

def img_path(k): return os.path.join(IMGS, IMG[k])

src_prs = Presentation(SRC)
prs = Presentation()
prs.slide_width  = src_prs.slide_width   # 13.33"
prs.slide_height = src_prs.slide_height  # 7.50"
slide = prs.slides.add_slide(prs.slide_layouts[6])

# ── Helpers ───────────────────────────────────────────────────────────────────
def rect(l,t,w,h, fill=None, line=None, lw=Pt(1.0),
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

def tb(l,t,w,h, lines, fs=9, align=PP_ALIGN.CENTER, bold_first=True, color=None):
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
        r.font.color.rgb=RGBColor(*(color or (0x16,0x19,0x1F)))
    return box

def circle(l,t,num,sz=Inches(0.28), dark=True):
    sh=slide.shapes.add_shape(MSO_SHAPE.OVAL,l,t,sz,sz)
    sh.fill.solid()
    sh.fill.fore_color.rgb=RGBColor(0x16,0x19,0x1F) if dark else RGBColor(0xFF,0xFF,0xFF)
    sh.line.fill.background()
    bp=sh._element.find(qn('p:txBody')).find(qn('a:bodyPr'))
    for a in ('lIns','tIns','rIns','bIns'): bp.set(a,'0')
    bp.set('anchor','ctr')
    p=sh.text_frame.paragraphs[0]; p.alignment=PP_ALIGN.CENTER
    r=p.add_run(); r.text=str(num)
    r.font.name='Arial'; r.font.size=Pt(9); r.font.bold=True
    r.font.color.rgb=RGBColor(0xFF,0xFF,0xFF) if dark else RGBColor(0x16,0x19,0x1F)
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

def icon(k,l,t,sz=None):
    sz=sz or ICON
    p=img_path(k)
    if os.path.exists(p): return slide.shapes.add_picture(p,l,t,sz,sz)
    print(f"  MISSING: {p}"); return None

def ir(x,y): return (x+ICON,   y+ICON/2)
def il(x,y): return (x,        y+ICON/2)
def ib(x,y): return (x+ICON/2, y+ICON)
def it(x,y): return (x+ICON/2, y)

# ═══════════════════════════════════════════════════════════════════════════════
# TITLE AREA (matches screenshot exactly)
# ═══════════════════════════════════════════════════════════════════════════════
title=slide.shapes.add_textbox(Inches(0.16),Inches(0.05),Inches(9.3),Inches(0.45))
tf=title.text_frame; p=tf.paragraphs[0]; r=p.add_run()
r.text='Guidance for Travel Concierge using Amazon Bedrock AgentCore and Nova Sonic 2'
r.font.name='Arial'; r.font.size=Pt(18); r.font.bold=True
r.font.color.rgb=RGBColor(0x16,0x19,0x1F)

desc=slide.shapes.add_textbox(Inches(0.16),Inches(0.52),Inches(9.3),Inches(0.35))
tf=desc.text_frame; p=tf.paragraphs[0]; r=p.add_run()
r.text='This architecture diagram shows how to build a voice-enabled airline concierge using Amazon Bedrock AgentCore and Nova 2 Sonic with MCP tool integration.'
r.font.name='Arial'; r.font.size=Pt(9)
r.font.color.rgb=RGBColor(0x16,0x19,0x1F)

hline(Inches(0.13),Inches(0.92),Inches(9.63),Inches(0.92))

# ═══════════════════════════════════════════════════════════════════════════════
# SIDEBAR (right panel — numbered steps with bold service names)
# ═══════════════════════════════════════════════════════════════════════════════
rect(Inches(9.82),Inches(0),Inches(3.52),Inches(7.5),fill=(0xEA,0xED,0xED))

# Sidebar steps — Travel Concierge specific, matching the screenshot bold style
sidebar_steps = [
    ("You access the web application hosted on ", "AWS Amplify", " from a browser or mobile device."),
    ("You authenticate with ", "Amazon Cognito", " using username and password to receive JWT tokens and temporary AWS credentials."),
    ("The frontend opens a SigV4-signed WebSocket connection to ", "Amazon Bedrock AgentCore", ", an enterprise-grade service for deploying and operating AI agents at scale, to begin the voice concierge session."),
    ("The runtime validates the token via ", "Amazon Cognito", " and initializes ", "Amazon Nova 2 Sonic", " through ", "Amazon Bedrock", ", a fully managed service with built-in security, privacy, and responsible AI."),
    ("You speak your request. The agent processes voice through ", "Amazon Nova 2 Sonic", " and invokes tool functions via ", "AWS Lambda", " to retrieve flight data, manage bookings, and update passenger preferences."),
    ("AgentCore Gateway forwards requests as REST API calls to ", "Amazon API Gateway", ", which routes them to ", "AWS Lambda", " functions."),
    ("AWS Lambda", " functions query ", "Amazon DynamoDB", " tables for bookings, passengers, seat maps, loyalty status, and flight information. Email notifications are sent via ", "Amazon SES", "."),
    ("Amazon Nova 2 Sonic", " generates a contextual voice response and streams it back to you over the WebSocket connection via ", "AgentCore Runtime", "."),
    ("When you request a live agent, ", "AWS Lambda", " logs the escalation in ", "Amazon DynamoDB", " and returns a reference number. ", "AWS Amplify", " triggers the call from your device to connect you directly to the live agent."),
    ("For policy questions, ", "AWS Lambda", " queries the ", "Amazon Bedrock Knowledge Base", ". ", "Amazon Nova Lite", " generates a natural language answer from retrieved airline policy documents."),
    ("AWS CDK", " deploys the solution with a single script, uploading application code to ", "Amazon S3", " and triggering ", "AWS CodeBuild", " to build container images stored in ", "Amazon ECR", " for the AgentCore runtime."),
    ("Amazon CloudWatch", " provides centralized monitoring, logging, and alerting across all services. All data at rest is encrypted using ", "AWS KMS", "."),
]

y0=Inches(0.15); dy=Inches(0.60)
for i, parts in enumerate(sidebar_steps):
    y=y0+i*dy
    circle(Inches(10.02),y,i+1)
    # Build rich text with bold service names
    stb=slide.shapes.add_textbox(Inches(10.38),y,Inches(2.80),Inches(0.68))
    tf=stb.text_frame; tf.word_wrap=True
    bp=stb._element.find(qn('p:txBody')).find(qn('a:bodyPr'))
    for a in ('lIns','tIns','rIns','bIns'): bp.set(a,'0')
    p=tf.paragraphs[0]
    for j, part in enumerate(parts):
        r=p.add_run(); r.text=part
        r.font.name='Arial'; r.font.size=Pt(7.5)
        # Odd-indexed parts are service names (bold)
        r.font.bold = (j % 2 == 1)
        r.font.color.rgb=RGBColor(0x16,0x19,0x1F)

# ═══════════════════════════════════════════════════════════════════════════════
# AWS CLOUD BOUNDARY
# ═══════════════════════════════════════════════════════════════════════════════
CL=Inches(0.20); CT=Inches(1.00); CW=Inches(9.45); CH=Inches(5.90)
cloud=slide.shapes.add_shape(MSO_SHAPE.RECTANGLE,CL,CT,CW,CH)
cloud.fill.background()
cloud.line.color.rgb=RGBColor(0x16,0x19,0x1F); cloud.line.width=Pt(1.5)
cloud.text_frame.text=''
icon('cloud_group',CL,CT,sz=Inches(0.32))
tb(Inches(0.62),CT+Inches(0.02),Inches(1.5),Inches(0.28),['AWS Cloud'],fs=11,align=PP_ALIGN.LEFT)

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION BOXES (matching screenshot colors exactly)
# Row 1: Frontend & Auth | Agent Runtime | AI/ML
# Row 2: MCP Gateway | API & Compute | Data Storage | Knowledge Base
# Row 3: Build Pipeline | Security & Monitoring
# ═══════════════════════════════════════════════════════════════════════════════

# Row 1 section boxes (y=1.18, h=1.55)
R1Y=Inches(1.18); R1H=Inches(1.55)
rect(Inches(0.30),R1Y,Inches(2.20),R1H, fill=(0xFD,0xE8,0xEE),line=(0xF0,0xB0,0xC4),
     text='Frontend & Authentication',bold=True,fs=8)
rect(Inches(2.65),R1Y,Inches(2.20),R1H, fill=(0xFD,0xF0,0xE2),line=(0xED,0xBB,0x82),
     text='Agent Runtime',bold=True,fs=8)
rect(Inches(5.00),R1Y,Inches(2.20),R1H, fill=(0xE2,0xF5,0xF2),line=(0x01,0xA8,0x8D),
     text='AI / ML',bold=True,fs=8)

# Row 2 section boxes (y=2.90, h=1.55)
R2Y=Inches(2.90); R2H=Inches(1.55)
rect(Inches(0.30),R2Y,Inches(1.55),R2H, fill=(0xE8,0xF0,0xFD),line=(0x82,0xA8,0xE0),
     text='MCP Gateway',bold=True,fs=8)
rect(Inches(2.00),R2Y,Inches(2.20),R2H, fill=(0xFD,0xF0,0xE2),line=(0xED,0xBB,0x82),
     text='API & Compute',bold=True,fs=8)
rect(Inches(4.35),R2Y,Inches(1.55),R2H, fill=(0xE8,0xF0,0xE2),line=(0x1B,0x66,0x0F),
     text='Data Storage',bold=True,fs=8)
rect(Inches(6.05),R2Y,Inches(3.35),R2H, fill=(0xE2,0xF5,0xF2),line=(0x01,0xA8,0x8D),
     text='Knowledge Base',bold=True,fs=8)

# Row 3 section boxes (y=4.62, h=1.55)
R3Y=Inches(4.62); R3H=Inches(1.55)
rect(Inches(0.30),R3Y,Inches(5.30),R3H, fill=(0xF0,0xF0,0xF0),line=(0xC0,0xC0,0xC0),
     text='Amazon Bedrock AgentCore Runtime Build Pipeline',bold=True,fs=8)
rect(Inches(5.75),R3Y,Inches(3.65),R3H, fill=(0xF5,0xE8,0xF0),line=(0xE7,0x15,0x7B),
     text='Security & Monitoring',bold=True,fs=8)

# ═══════════════════════════════════════════════════════════════════════════════
# ICON POSITIONS
# Row 1: Cognito(0.65,1.45) Amplify(1.45,1.45) | Runtime(3.05,1.45) | NovaSonic(5.40,1.45)
# Row 2: Gateway(0.65,3.17) | APIGW(2.35,3.17) Lambda(3.35,3.17) | DDB(4.70,3.17) | KB(6.40,3.17) NoveLite(7.60,3.17)
# Row 3: CDK(0.65,4.90) S3(1.75,4.90) CodeBuild(2.85,4.90) ECR(3.95,4.90) | KMS(6.15,4.90) CW(7.25,4.90)
# Outside: Users(left of cloud)
# ═══════════════════════════════════════════════════════════════════════════════

# Outside cloud
icon('users',Inches(0.00),Inches(2.40))
tb(Inches(0.00),Inches(2.85),Inches(0.85),Inches(0.25),['Users'],fs=8)

# Row 1 — Frontend & Auth
icon('cognito',Inches(0.65),Inches(1.45))
tb(Inches(0.30),Inches(1.88),Inches(1.1),Inches(0.30),['Amazon Cognito'],fs=8)

icon('amplify',Inches(1.55),Inches(1.45))
tb(Inches(1.20),Inches(1.88),Inches(1.1),Inches(0.30),['AWS Amplify'],fs=8)

# Row 1 — Agent Runtime
icon('agentcore',Inches(3.05),Inches(1.45))
tb(Inches(2.70),Inches(1.88),Inches(1.1),Inches(0.30),['Amazon Bedrock','AgentCore Runtime'],fs=8)

# Row 1 — AI/ML
icon('nova_sonic',Inches(5.40),Inches(1.45))
tb(Inches(5.05),Inches(1.88),Inches(1.1),Inches(0.30),['Amazon Bedrock','Nova 2 Sonic'],fs=8)

# Row 2 — MCP Gateway
icon('agentcore',Inches(0.65),Inches(3.17))
tb(Inches(0.30),Inches(3.60),Inches(1.1),Inches(0.30),['Amazon Bedrock','AgentCore Gateway'],fs=8)

# Row 2 — API & Compute
icon('api_gateway',Inches(2.35),Inches(3.17))
tb(Inches(2.00),Inches(3.60),Inches(1.1),Inches(0.30),['Amazon API Gateway'],fs=8)

icon('lambda',Inches(3.35),Inches(3.17))
tb(Inches(3.00),Inches(3.60),Inches(1.1),Inches(0.30),['AWS Lambda'],fs=8)

# Row 2 — Data Storage
icon('dynamodb',Inches(4.70),Inches(3.17))
tb(Inches(4.35),Inches(3.60),Inches(1.1),Inches(0.30),['Amazon DynamoDB'],fs=8)

# Row 2 — Knowledge Base
icon('bedrock_kb',Inches(6.40),Inches(3.17))
tb(Inches(6.05),Inches(3.60),Inches(1.1),Inches(0.30),['Knowledge Base','Bedrock + vector'],fs=8)

icon('nova_lite',Inches(7.60),Inches(3.17))
tb(Inches(7.25),Inches(3.60),Inches(1.1),Inches(0.30),['Nova Lite','KB gen model'],fs=8)

# Row 3 — Build Pipeline
icon('cdk',Inches(0.65),Inches(4.90))
tb(Inches(0.30),Inches(5.33),Inches(1.1),Inches(0.25),['AWS CDK'],fs=8)

icon('s3',Inches(1.75),Inches(4.90))
tb(Inches(1.40),Inches(5.33),Inches(1.1),Inches(0.25),['Amazon S3'],fs=8)

icon('codebuild',Inches(2.85),Inches(4.90))
tb(Inches(2.50),Inches(5.33),Inches(1.1),Inches(0.25),['AWS CodeBuild'],fs=8)

icon('ecr',Inches(3.95),Inches(4.90))
tb(Inches(3.60),Inches(5.33),Inches(1.1),Inches(0.25),['Amazon ECR'],fs=8)

# Row 3 — Security & Monitoring
icon('kms',Inches(6.15),Inches(4.90))
tb(Inches(5.80),Inches(5.33),Inches(1.1),Inches(0.25),['AWS KMS'],fs=8)

icon('cloudwatch',Inches(7.25),Inches(4.90))
tb(Inches(6.90),Inches(5.33),Inches(1.1),Inches(0.25),['Amazon CloudWatch'],fs=8)

# ═══════════════════════════════════════════════════════════════════════════════
# ARROWS
# ═══════════════════════════════════════════════════════════════════════════════
# 1. Users → Amplify
arrow(*ir(Inches(0.00),Inches(2.40)), *il(Inches(1.55),Inches(1.65)))

# 2. Amplify ↔ Cognito (bidirectional)
arrow(*ir(Inches(0.65),Inches(1.45)), *il(Inches(1.55),Inches(1.65)))  # Cognito → Amplify
arrow(Inches(1.55),Inches(1.85), Inches(1.05),Inches(1.85))            # Amplify → Cognito

# 3. Amplify → AgentCore Runtime (horizontal — WebSocket)
arrow(*ir(Inches(1.55),Inches(1.65)), *il(Inches(3.05),Inches(1.65)))

# 4. AgentCore Runtime ↔ Nova Sonic (horizontal bidirectional)
arrow(*ir(Inches(3.05),Inches(1.55)), *il(Inches(5.40),Inches(1.55)))  # Runtime → Nova Sonic
arrow(Inches(5.40),Inches(1.75), Inches(3.45),Inches(1.75))            # Nova Sonic → Runtime

# 5. Amplify ↔ AgentCore Runtime return (audio back to browser)
arrow(Inches(3.05),Inches(1.85), Inches(1.95),Inches(1.85))

# 6. AgentCore Runtime → AgentCore Gateway (vertical down)
arrow(*ib(Inches(3.05),Inches(1.45)), *it(Inches(0.85),Inches(3.17)))

# 7. AgentCore Gateway → API Gateway (horizontal right)
arrow(*ir(Inches(0.65),Inches(3.37)), *il(Inches(2.35),Inches(3.37)))

# 8. API Gateway → Lambda (horizontal right)
arrow(*ir(Inches(2.35),Inches(3.17)), *il(Inches(3.35),Inches(3.17)))

# 9. Lambda → DynamoDB (horizontal right)
arrow(*ir(Inches(3.35),Inches(3.17)), *il(Inches(4.70),Inches(3.17)))

# 10. Lambda → Knowledge Base (horizontal right)
arrow(Inches(3.75),Inches(3.17), Inches(6.40),Inches(3.37))

# 11. Knowledge Base ↔ Nova Lite (horizontal bidirectional)
arrow(*ir(Inches(6.40),Inches(3.17)), *il(Inches(7.60),Inches(3.17)))
arrow(Inches(7.60),Inches(3.37), Inches(6.80),Inches(3.37))

# 12. Build pipeline: CDK → S3 → CodeBuild → ECR
arrow(*ir(Inches(0.65),Inches(4.90+0.20)), *il(Inches(1.75),Inches(4.90+0.20)))
arrow(*ir(Inches(1.75),Inches(4.90+0.20)), *il(Inches(2.85),Inches(4.90+0.20)))
arrow(*ir(Inches(2.85),Inches(4.90+0.20)), *il(Inches(3.95),Inches(4.90+0.20)))

# 13. ECR → AgentCore Runtime (vertical up)
arrow(*it(Inches(3.95),Inches(4.90)), *ib(Inches(3.25),Inches(1.45)))

# ═══════════════════════════════════════════════════════════════════════════════
# NUMBERED CALLOUTS ON DIAGRAM
# ═══════════════════════════════════════════════════════════════════════════════
circle(Inches(0.00),Inches(2.20),1)    # Users
circle(Inches(0.50),Inches(1.28),2)    # Cognito
circle(Inches(2.85),Inches(1.28),3)    # Amplify → Runtime
circle(Inches(5.20),Inches(1.28),4)    # Nova Sonic
circle(Inches(3.45),Inches(1.65),5)    # Runtime ↔ Nova Sonic
circle(Inches(0.50),Inches(3.00),6)    # AgentCore Gateway
circle(Inches(3.15),Inches(3.00),7)    # Lambda → DDB
circle(Inches(6.20),Inches(3.00),8)    # Knowledge Base
circle(Inches(0.50),Inches(4.72),11)   # Build pipeline
circle(Inches(7.05),Inches(4.72),12)   # CloudWatch

# ═══════════════════════════════════════════════════════════════════════════════
# FOOTER (matching screenshot)
# ═══════════════════════════════════════════════════════════════════════════════
footer=slide.shapes.add_textbox(Inches(0.16),Inches(7.10),Inches(6.0),Inches(0.30))
tf=footer.text_frame; p=tf.paragraphs[0]; r=p.add_run()
r.text='© 2026, Amazon Web Services, Inc. or its affiliates. All rights reserved.'
r.font.name='Arial'; r.font.size=Pt(7)
r.font.color.rgb=RGBColor(0x55,0x55,0x55)

ref=slide.shapes.add_textbox(Inches(6.5),Inches(7.05),Inches(3.0),Inches(0.35))
tf=ref.text_frame; p=tf.paragraphs[0]; p.alignment=PP_ALIGN.RIGHT
r=p.add_run(); r.text='AWS Reference Architecture'
r.font.name='Arial'; r.font.size=Pt(11); r.font.bold=True
r.font.color.rgb=RGBColor(0xFF,0x99,0x00)  # AWS orange

# ═══════════════════════════════════════════════════════════════════════════════
# SAVE
# ═══════════════════════════════════════════════════════════════════════════════
prs.save(OUT)
print(f"\nSaved: {OUT}")
prs2=Presentation(OUT)
bad=[f"{s.name}:{s.width/914400:.2f}x{s.height/914400:.2f}"
     for s in prs2.slides[0].shapes if s.shape_type==13
     and (abs(s.width/914400-0.40)>0.01 or abs(s.height/914400-0.40)>0.01)]
print("Icon size issues:",bad if bad else "none ✓")
print("Done!")
