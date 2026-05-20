"""
Travel Concierge Architecture Diagram v2
Format: telephony-ai-host.pptx style (white bg, section boxes, sidebar, numbered steps)
Layout: matches flow-visualizer.html screenshot exactly

Service positions:
  Row 1 (y=2.02): Cognito(1.49) | NovaSonic(3.40) | KB(6.50) NoveLite(7.90)
  Row 2 (y=3.50): Browser(1.49) | Runtime(3.40) Gateway(4.80) | APIGW(6.10) Lambda(7.30) DDB(8.50)
  Row 3 (y=5.20): LiveAgent(1.49)

Section boxes:
  Customer:  x=1.20 y=1.83 w=1.70 h=4.50  (Cognito+Browser+LiveAgent)
  AgentCore: x=3.10 y=1.83 w=2.20 h=2.50  (NovaSonic+Runtime+Gateway)
  Backend:   x=5.80 y=1.83 w=3.65 h=2.50  (KB+NoveLite+APIGW+Lambda+DDB)
  BuildPipeline: row 3 backend area
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
def ir(x,y): return (x+ICON,   y+ICON/2)
def il(x,y): return (x,        y+ICON/2)
def ib(x,y): return (x+ICON/2, y+ICON)
def it(x,y): return (x+ICON/2, y)

# ── Icon positions (top-left of each icon) ────────────────────────────────────
# Row 1 (y=2.02) — top row
Y1 = Inches(2.02)
# Row 2 (y=3.50) — main flow row
Y2 = Inches(3.50)
# Row 3 (y=5.10) — bottom row
Y3 = Inches(5.10)
# Build pipeline row
Y4 = Inches(5.92)

# X positions
X_COG  = Inches(1.49)   # Cognito / Browser / LiveAgent (Customer column)
X_NS   = Inches(3.40)   # Nova Sonic (above Runtime)
X_RT   = Inches(3.40)   # AgentCore Runtime
X_GW   = Inches(4.80)   # AgentCore Gateway
X_KB   = Inches(6.10)   # Knowledge Base
X_NL   = Inches(7.50)   # Nova Lite
X_APIGW= Inches(6.10)   # API Gateway
X_LMB  = Inches(7.30)   # Lambda
X_DDB  = Inches(8.50)   # DynamoDB
X_S3   = Inches(3.15)   # S3
X_CB   = Inches(4.47)   # CodeBuild
X_ECR  = Inches(5.77)   # ECR
X_CW   = Inches(7.43)   # CloudWatch

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
# Customer section — tall, covers Cognito + Browser + LiveAgent
rect(Inches(1.20),Inches(1.83),Inches(1.70),Inches(4.50),
     fill=(0xE8,0xF4,0xFD),line=(0xB0,0xD4,0xF1),text='Customer',bold=True)

# Bedrock AgentCore — covers NovaSonic(top) + Runtime + Gateway(middle)
rect(Inches(3.10),Inches(1.83),Inches(2.20),Inches(2.50),
     fill=(0xF0,0xF8,0xF0),line=(0x82,0xD4,0xA8),text='Bedrock AgentCore',bold=True)

# Backend top — KB + Nova Lite
rect(Inches(5.80),Inches(1.83),Inches(3.65),Inches(1.10),
     fill=(0xE2,0xF5,0xF2),line=(0x01,0xA8,0x8D),text='Knowledge Base',bold=True)

# Backend middle — API GW + Lambda + DDB
rect(Inches(5.80),Inches(3.10),Inches(3.65),Inches(1.10),
     fill=(0xFD,0xF0,0xE2),line=(0xED,0xBB,0x82),text='API & Compute + Data',bold=True)

# Build Pipeline
rect(Inches(2.77),Inches(5.49),Inches(3.80),Inches(1.16),
     fill=(0xF0,0xF0,0xF0),line=(0xC0,0xC0,0xC0),text='Build Pipeline',bold=True)

# Monitoring
rect(Inches(6.83),Inches(5.49),Inches(2.70),Inches(1.16),
     fill=(0xF5,0xE8,0xF0),line=(0xE7,0x15,0x7B),text='Monitoring',bold=True)

# ── ICONS + LABELS ────────────────────────────────────────────────────────────
# Outside cloud — Users (left of boundary)
icon('users',Inches(0.31),Inches(3.30))
tb(Inches(0.05),Inches(3.75),Inches(1.1),Inches(0.3),['Users'],fs=9)

# CUSTOMER column
icon('cognito',X_COG,Y1)
tb(X_COG-Inches(0.05),Y1+ICON+Inches(0.05),Inches(1.1),Inches(0.35),
   ['Amazon Cognito','JWT + Identity Pool'],fs=8)

icon('amplify',X_COG,Y2)
tb(X_COG-Inches(0.05),Y2+ICON+Inches(0.05),Inches(1.1),Inches(0.35),
   ['Browser / App','React + WebSocket'],fs=8)

icon('users',X_COG,Y3)
tb(X_COG-Inches(0.05),Y3+ICON+Inches(0.05),Inches(1.1),Inches(0.35),
   ['Live Agent','picks up the call'],fs=8)

# AGENTCORE — Nova Sonic (top row, above Runtime)
icon('nova_sonic',X_NS,Y1)
tb(X_NS-Inches(0.05),Y1+ICON+Inches(0.05),Inches(1.1),Inches(0.35),
   ['Nova Sonic 2','speech-to-speech'],fs=8)

# AGENTCORE — Runtime (middle row)
icon('agentcore',X_RT,Y2)
tb(X_RT-Inches(0.05),Y2+ICON+Inches(0.05),Inches(1.1),Inches(0.35),
   ['AgentCore Runtime','Strands BidiAgent'],fs=8)

# AGENTCORE — Gateway (middle row, right of Runtime)
icon('agentcore',X_GW,Y2)
tb(X_GW-Inches(0.05),Y2+ICON+Inches(0.05),Inches(1.1),Inches(0.35),
   ['AgentCore Gateway','MCP protocol'],fs=8)

# BACKEND top — Knowledge Base
icon('bedrock_kb',X_KB,Y1)
tb(X_KB-Inches(0.05),Y1+ICON+Inches(0.05),Inches(1.1),Inches(0.35),
   ['Knowledge Base','Bedrock + vector'],fs=8)

# BACKEND top — Nova Lite
icon('nova_lite',X_NL,Y1)
tb(X_NL-Inches(0.05),Y1+ICON+Inches(0.05),Inches(1.1),Inches(0.35),
   ['Nova Lite','KB gen model'],fs=8)

# BACKEND middle — API Gateway
icon('api_gateway',X_APIGW,Y2)
tb(X_APIGW-Inches(0.05),Y2+ICON+Inches(0.05),Inches(1.1),Inches(0.35),
   ['API Gateway','REST + AWS_IAM'],fs=8)

# BACKEND middle — Lambda
icon('lambda',X_LMB,Y2)
tb(X_LMB-Inches(0.05),Y2+ICON+Inches(0.05),Inches(1.1),Inches(0.35),
   ['Backend Lambdas','18 functions'],fs=8)

# BACKEND middle — DynamoDB
icon('dynamodb',X_DDB,Y2)
tb(X_DDB-Inches(0.05),Y2+ICON+Inches(0.05),Inches(1.1),Inches(0.35),
   ['DynamoDB','Bookings, Seats'],fs=8)

# Build Pipeline
icon('s3',X_S3,Y4)
tb(X_S3-Inches(0.05),Y4+ICON+Inches(0.05),Inches(1.1),Inches(0.25),['Amazon S3'],fs=9)
icon('codebuild',X_CB,Y4)
tb(X_CB-Inches(0.05),Y4+ICON+Inches(0.05),Inches(1.1),Inches(0.25),['AWS CodeBuild'],fs=9)
icon('ecr',X_ECR,Y4)
tb(X_ECR-Inches(0.05),Y4+ICON+Inches(0.05),Inches(1.1),Inches(0.25),['Amazon ECR'],fs=9)

# Monitoring
icon('cloudwatch',X_CW,Y4)
tb(X_CW-Inches(0.05),Y4+ICON+Inches(0.05),Inches(1.1),Inches(0.25),['Amazon CloudWatch'],fs=9)
icon('ses',Inches(8.58),Y4)
tb(Inches(8.53),Y4+ICON+Inches(0.05),Inches(1.1),Inches(0.25),['Amazon SES'],fs=9)

# ── ARROWS (matching flow-visualizer screenshot exactly) ──────────────────────
# 1. Users → Browser (horizontal right)
arrow(*ir(Inches(0.31),Inches(3.30)), *il(X_COG,Y2))

# 2a. Browser ↑ Cognito (vertical up — auth req)
arrow(*it(X_COG,Y2), *ib(X_COG,Y1))
# 2b. Cognito ↓ Browser (vertical down return, offset right)
arrow(X_COG+Inches(0.25),Y1+ICON, X_COG+Inches(0.25),Y2)

# 3a. Browser → AgentCore Runtime (horizontal right — WebSocket in)
arrow(*ir(X_COG,Y2), *il(X_RT,Y2))
# 3b. AgentCore Runtime → Browser (horizontal left return — audio out, offset down)
arrow(X_RT, Y2+Inches(0.25), X_COG+ICON, Y2+Inches(0.25))

# 4a. Nova Sonic ↓ AgentCore Runtime (vertical down — audio out)
arrow(*ib(X_NS,Y1), *it(X_RT,Y2))
# 4b. AgentCore Runtime ↑ Nova Sonic (vertical up — audio in, offset right)
arrow(X_RT+Inches(0.25),Y2, X_NS+Inches(0.25),Y1+ICON)

# 5. AgentCore Runtime → AgentCore Gateway (horizontal right)
arrow(*ir(X_RT,Y2), *il(X_GW,Y2))

# 6a. AgentCore Gateway → API Gateway (horizontal right)
arrow(*ir(X_GW,Y2), *il(X_APIGW,Y2))
# 6b. API Gateway → AgentCore Gateway (horizontal left return, offset down)
arrow(X_APIGW, Y2+Inches(0.25), X_GW+ICON, Y2+Inches(0.25))

# 7a. API Gateway → Lambda (horizontal right)
arrow(*ir(X_APIGW,Y2), *il(X_LMB,Y2))
# 7b. Lambda → API Gateway (horizontal left return, offset down)
arrow(X_LMB, Y2+Inches(0.25), X_APIGW+ICON, Y2+Inches(0.25))

# 8. Lambda → DynamoDB (horizontal right)
arrow(*ir(X_LMB,Y2), *il(X_DDB,Y2))

# 9. Lambda ↑ Knowledge Base (vertical up)
arrow(*it(X_LMB,Y2), *ib(X_KB+Inches(0.10),Y1))

# 10a. Knowledge Base → Nova Lite (horizontal right)
arrow(*ir(X_KB,Y1), *il(X_NL,Y1))
# 10b. Nova Lite → Knowledge Base (horizontal left return, offset down)
arrow(X_NL, Y1+Inches(0.25), X_KB+ICON, Y1+Inches(0.25))

# 11. Browser ↓ Live Agent (vertical down — escalation)
arrow(*ib(X_COG,Y2), *it(X_COG,Y3))

# 12. Build pipeline: S3 → CodeBuild → ECR
arrow(*ir(X_S3,Y4), *il(X_CB,Y4))
arrow(*ir(X_CB,Y4), *il(X_ECR,Y4))

# 13. ECR ↑ AgentCore Runtime (vertical up)
arrow(*it(X_ECR,Y4), *ib(X_RT+Inches(0.10),Y2))

# ── NUMBERED CALLOUTS ─────────────────────────────────────────────────────────
circle(X_COG-Inches(0.15), Y1-Inches(0.15), 1)   # Cognito
circle(X_COG-Inches(0.15), Y2-Inches(0.15), 2)   # Browser WebSocket
circle(X_NS+Inches(0.45),  Y1-Inches(0.15), 3)   # Nova Sonic
circle(X_RT+Inches(0.45),  Y2-Inches(0.15), 4)   # Runtime
circle(X_GW+Inches(0.45),  Y2-Inches(0.15), 5)   # Gateway
circle(X_APIGW-Inches(0.15),Y2-Inches(0.15),6)   # API GW
circle(X_LMB+Inches(0.45), Y2-Inches(0.15), 7)   # Lambda
circle(X_KB-Inches(0.15),  Y1-Inches(0.15), 8)   # KB
circle(X_S3-Inches(0.15),  Y4-Inches(0.15), 9)   # Build pipeline

# ── SAVE ──────────────────────────────────────────────────────────────────────
prs.save(OUT)
print(f"\nSaved: {OUT}")
prs2=Presentation(OUT)
bad=[f"{s.name}:{s.width/914400:.2f}x{s.height/914400:.2f}"
     for s in prs2.slides[0].shapes if s.shape_type==13
     and (abs(s.width/914400-0.40)>0.01 or abs(s.height/914400-0.40)>0.01)]
print("Icon size issues:",bad if bad else "none ✓")
print("Done!")
