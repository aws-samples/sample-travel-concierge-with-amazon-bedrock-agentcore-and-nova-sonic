"""
Travel Concierge Architecture Diagram
Layout matches flow-visualizer.html exactly:

3 outer sections (horizontal):
  CUSTOMER (left)  |  BEDROCK AGENTCORE (center)  |  BACKEND (right)

CUSTOMER column (top to bottom):
  Cognito
  Browser/App  ←→ AgentCore Runtime (bidirectional WebSocket)
  Live Agent   ← Browser (call pickup)

BEDROCK AGENTCORE (center):
  Nova Sonic 2  ↕ (bidirectional with Runtime)
  AgentCore Runtime  →  AgentCore Gateway

BACKEND (right):
  Knowledge Base  ↔  Nova Lite  (top row)
  API Gateway  →  Backend Lambdas  →  DynamoDB  (middle row)
  Lambdas  ↑  Knowledge Base  (vertical)
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
ICON = Inches(0.50)  # slightly larger for readability

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
    'nova_lite':   'image4.png',  # reuse nova sonic icon for nova lite
}

def img_path(key):
    return os.path.join(IMGS, IMG[key])

src_prs = Presentation(SRC)
prs = Presentation()
prs.slide_width  = src_prs.slide_width   # 13.33"
prs.slide_height = src_prs.slide_height  # 7.50"
slide = prs.slides.add_slide(prs.slide_layouts[6])

# ── Helpers ───────────────────────────────────────────────────────────────────
def rect(left, top, w, h, fill=None, line=None, lw=Pt(1.5),
         text=None, fs=8, bold=False, tc=None, align=PP_ALIGN.LEFT,
         dash=False):
    sh = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, w, h)
    if fill: sh.fill.solid(); sh.fill.fore_color.rgb = RGBColor(*fill)
    else: sh.fill.background()
    if line:
        sh.line.color.rgb = RGBColor(*line); sh.line.width = lw
        if dash:
            from pptx.oxml.ns import qn as _qn
            ln_elem = sh._element.find('.//' + _qn('a:ln'))
            if ln_elem is not None:
                prstDash = ln_elem.makeelement(_qn('a:prstDash'), {'val': 'dash'})
                ln_elem.append(prstDash)
    else: sh.line.fill.background()
    bp = sh._element.find(qn('p:txBody')).find(qn('a:bodyPr'))
    bp.set('lIns', str(int(Emu(Inches(0.06))))); bp.set('tIns', str(int(Emu(Inches(0.04)))))
    bp.set('anchor', 't')
    if text:
        tf = sh.text_frame; tf.word_wrap = True
        p = tf.paragraphs[0]; p.alignment = align
        r = p.add_run(); r.text = text
        r.font.name='Arial'; r.font.size=Pt(fs); r.font.bold=bold
        r.font.color.rgb = RGBColor(*(tc or (0x16,0x19,0x1F)))
    return sh

def tb(left, top, w, h, lines, fs=9, align=PP_ALIGN.CENTER, bold_first=True, color=None):
    box = slide.shapes.add_textbox(left, top, w, h)
    tf = box.text_frame; tf.word_wrap = True
    bp = box._element.find(qn('p:txBody')).find(qn('a:bodyPr'))
    for a in ('lIns','tIns','rIns','bIns'): bp.set(a,'0')
    for i, lt in enumerate(lines):
        p = tf.paragraphs[0] if i==0 else tf.add_paragraph()
        p.alignment = align
        r = p.add_run(); r.text = lt
        r.font.name='Arial'; r.font.size=Pt(fs)
        r.font.bold = (i==0 and bold_first); r.font.italic = (i>0)
        r.font.color.rgb = RGBColor(*(color or (0x16,0x19,0x1F)))
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

def arrow(x1,y1,x2,y2, col=(0x54,0x57,0x5A), lw=Pt(1.5)):
    c = slide.shapes.add_connector(2, x1,y1,x2,y2)
    c.line.color.rgb = RGBColor(*col); c.line.width = lw
    ln = c._element.find('.//' + qn('a:ln'))
    if ln is None:
        ln = c._element.makeelement(qn('a:ln'),{}); c._element.append(ln)
    ln.append(ln.makeelement(qn('a:tailEnd'),{'type':'triangle','w':'med','len':'med'}))
    return c

def hline(x1,y1,x2,y2, col=(0x16,0x19,0x1F), lw=Pt(1.0)):
    c = slide.shapes.add_connector(1, x1,y1,x2,y2)
    c.line.color.rgb = RGBColor(*col); c.line.width = lw
    return c

def icon(key, left, top, size=None):
    sz = size or ICON
    path = img_path(key)
    if os.path.exists(path):
        return slide.shapes.add_picture(path, left, top, sz, sz)
    print(f"  MISSING: {path}"); return None

# Edge helpers
def ir(x,y,sz=None): sz=sz or ICON; return (x+sz, y+sz/2)
def il(x,y,sz=None): sz=sz or ICON; return (x,    y+sz/2)
def ib(x,y,sz=None): sz=sz or ICON; return (x+sz/2, y+sz)
def it(x,y,sz=None): sz=sz or ICON; return (x+sz/2, y)

# ═══════════════════════════════════════════════════════════════════════════════
# LAYOUT CONSTANTS
# Slide: 13.33" x 7.50"
# Sidebar: 9.82" to 13.33" (3.52" wide)
# Diagram area: 0" to 9.50"
#
# 3 outer sections:
#   CUSTOMER:  x=0.15 to 2.20  (w=2.05)
#   AGENTCORE: x=2.30 to 5.20  (w=2.90)
#   BACKEND:   x=5.30 to 9.45  (w=4.15)
#
# Vertical zones:
#   Title area: y=0 to 1.10
#   Top row (KB/NovaSonic): y=1.55 to 3.10
#   Middle row (main flow): y=3.20 to 4.90
#   Bottom row (live agent/build): y=5.00 to 6.80
# ═══════════════════════════════════════════════════════════════════════════════

# ── TITLE ─────────────────────────────────────────────────────────────────────
title = slide.shapes.add_textbox(Inches(0.16), Inches(0.05), Inches(9.5), Inches(0.55))
tf = title.text_frame; p = tf.paragraphs[0]; r = p.add_run()
r.text = 'Guidance for Travel Concierge using Amazon Bedrock AgentCore and Nova Sonic 2'
r.font.name='Arial'; r.font.size=Pt(20); r.font.bold=True
r.font.color.rgb = RGBColor(0x16,0x19,0x1F)

desc = slide.shapes.add_textbox(Inches(0.16), Inches(0.62), Inches(9.5), Inches(0.35))
tf = desc.text_frame; p = tf.paragraphs[0]; r = p.add_run()
r.text = 'This architecture diagram shows how to build a voice-enabled airline concierge using Amazon Bedrock AgentCore, Nova Sonic 2, and MCP tool integration.'
r.font.name='Arial'; r.font.size=Pt(10)
r.font.color.rgb = RGBColor(0x16,0x19,0x1F)

hline(Inches(0.13), Inches(1.00), Inches(9.63), Inches(1.00))

# ── SIDEBAR ───────────────────────────────────────────────────────────────────
rect(Inches(9.82), Inches(0), Inches(3.52), Inches(7.5), fill=(0xEA,0xED,0xED))

steps = [
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

y0 = Inches(0.23); dy = Inches(0.82)
for i, s in enumerate(steps):
    y = y0 + i*dy
    circle(Inches(10.02), y, i+1)
    stb = slide.shapes.add_textbox(Inches(10.4), y, Inches(2.75), Inches(0.75))
    tf = stb.text_frame; tf.word_wrap = True
    bp = stb._element.find(qn('p:txBody')).find(qn('a:bodyPr'))
    for a in ('lIns','tIns','rIns','bIns'): bp.set(a,'0')
    p = tf.paragraphs[0]; r = p.add_run(); r.text = s
    r.font.name='Arial'; r.font.size=Pt(8)
    r.font.color.rgb = RGBColor(0x16,0x19,0x1F)

# ── AWS CLOUD BOUNDARY ────────────────────────────────────────────────────────
CL=Inches(0.13); CT=Inches(1.10); CW=Inches(9.50); CH=Inches(6.20)
cloud = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, CL, CT, CW, CH)
cloud.fill.background()
cloud.line.color.rgb = RGBColor(0x16,0x19,0x1F); cloud.line.width = Pt(1.5)
cloud.text_frame.text = ''
icon('cloud_group', CL, CT, size=Inches(0.35))
tb(Inches(0.60), CT, Inches(1.2), Inches(0.3), ['AWS Cloud'], fs=11, align=PP_ALIGN.LEFT)

# ── 3 OUTER SECTION BOXES ─────────────────────────────────────────────────────
# CUSTOMER
rect(Inches(0.20), Inches(1.45), Inches(2.00), Inches(5.70),
     line=(0x63,0x66,0xF1), lw=Pt(1.5), dash=True,
     text='CUSTOMER', fs=8, bold=True, tc=(0x63,0x66,0xF1), align=PP_ALIGN.CENTER)

# BEDROCK AGENTCORE
rect(Inches(2.30), Inches(1.45), Inches(2.90), Inches(5.70),
     line=(0x8B,0x5C,0xF6), lw=Pt(1.5), dash=True,
     text='BEDROCK AGENTCORE', fs=8, bold=True, tc=(0x8B,0x5C,0xF6), align=PP_ALIGN.CENTER)

# BACKEND
rect(Inches(5.30), Inches(1.45), Inches(4.20), Inches(5.70),
     line=(0x34,0xD3,0x99), lw=Pt(1.5), dash=True,
     text='BACKEND', fs=8, bold=True, tc=(0x34,0xD3,0x99), align=PP_ALIGN.CENTER)

# ── ICON POSITIONS ────────────────────────────────────────────────────────────
# CUSTOMER column (centered at x≈0.95)
CX = Inches(0.70)   # icon left x in customer box
# AGENTCORE column
AX = Inches(2.65)   # runtime x
AGX = Inches(4.10)  # gateway x
NSX = Inches(3.35)  # nova sonic x (above runtime, centered)
# BACKEND
APIX = Inches(5.50)
LX   = Inches(6.60)
DBX  = Inches(8.30)
KBX  = Inches(5.50)
NLX  = Inches(6.90)

# Vertical positions
Y_TOP    = Inches(1.90)   # top row (Cognito, Nova Sonic, KB/NovaSonic)
Y_MID    = Inches(3.30)   # middle row (Browser, Runtime, Gateway, API GW, Lambda, DDB)
Y_BOT    = Inches(4.90)   # bottom row (Live Agent)

# ── ICONS ─────────────────────────────────────────────────────────────────────
# CUSTOMER
icon('cognito',    CX, Y_TOP)
tb(Inches(0.35), Y_TOP+ICON+Inches(0.05), Inches(1.1), Inches(0.35),
   ['Amazon Cognito', 'JWT + Identity Pool'], fs=8)

icon('amplify',    CX, Y_MID)
tb(Inches(0.35), Y_MID+ICON+Inches(0.05), Inches(1.1), Inches(0.35),
   ['Browser / App', 'React + WebSocket'], fs=8)

icon('users',      CX, Y_BOT)
tb(Inches(0.35), Y_BOT+ICON+Inches(0.05), Inches(1.1), Inches(0.35),
   ['Live Agent', 'picks up the call'], fs=8)

# AGENTCORE — Nova Sonic (top, above Runtime)
icon('nova_sonic', NSX, Y_TOP)
tb(NSX-Inches(0.05), Y_TOP+ICON+Inches(0.05), Inches(1.1), Inches(0.35),
   ['Nova Sonic 2', 'speech-to-speech'], fs=8)

# AGENTCORE — Runtime (middle)
icon('agentcore',  AX, Y_MID)
tb(AX-Inches(0.05), Y_MID+ICON+Inches(0.05), Inches(1.1), Inches(0.35),
   ['AgentCore Runtime', 'Strands BidiAgent'], fs=8)

# AGENTCORE — Gateway (middle, right of Runtime)
icon('agentcore',  AGX, Y_MID)
tb(AGX-Inches(0.05), Y_MID+ICON+Inches(0.05), Inches(1.1), Inches(0.35),
   ['AgentCore Gateway', 'MCP protocol'], fs=8)

# BACKEND — Knowledge Base (top-left)
icon('bedrock_kb', KBX, Y_TOP)
tb(KBX-Inches(0.05), Y_TOP+ICON+Inches(0.05), Inches(1.1), Inches(0.35),
   ['Knowledge Base', 'Bedrock + vector'], fs=8)

# BACKEND — Nova Lite (top-right)
icon('nova_lite',  NLX, Y_TOP)
tb(NLX-Inches(0.05), Y_TOP+ICON+Inches(0.05), Inches(1.1), Inches(0.35),
   ['Nova Lite', 'KB gen model'], fs=8)

# BACKEND — API Gateway (middle)
icon('api_gateway', APIX, Y_MID)
tb(APIX-Inches(0.05), Y_MID+ICON+Inches(0.05), Inches(1.1), Inches(0.35),
   ['API Gateway', 'REST + AWS_IAM'], fs=8)

# BACKEND — Lambda (middle)
icon('lambda',     LX, Y_MID)
tb(LX-Inches(0.05), Y_MID+ICON+Inches(0.05), Inches(1.1), Inches(0.35),
   ['Backend Lambdas', '18 functions'], fs=8)

# BACKEND — DynamoDB (middle-right)
icon('dynamodb',   DBX, Y_MID)
tb(DBX-Inches(0.05), Y_MID+ICON+Inches(0.05), Inches(1.1), Inches(0.35),
   ['DynamoDB', 'Bookings, Seats'], fs=8)

# ── ARROWS ────────────────────────────────────────────────────────────────────
# 1. Cognito ↕ Browser (vertical bidirectional)
arrow(*ib(CX, Y_TOP), *it(CX, Y_MID))                          # Cognito → Browser
arrow(CX+ICON*0.6, Y_MID, CX+ICON*0.6, Y_TOP+ICON)            # Browser → Cognito

# 2. Browser → AgentCore Runtime (horizontal right)
arrow(*ir(CX, Y_MID), *il(AX, Y_MID))

# 3. AgentCore Runtime → Browser (horizontal left return, offset)
arrow(AX, Y_MID+ICON*0.6, CX+ICON, Y_MID+ICON*0.6)

# 4. Nova Sonic ↕ AgentCore Runtime (vertical bidirectional)
arrow(*ib(NSX, Y_TOP), *it(AX, Y_MID))                         # Nova Sonic → Runtime
arrow(AX+ICON*0.6, Y_MID, NSX+ICON*0.6, Y_TOP+ICON)           # Runtime → Nova Sonic

# 5. AgentCore Runtime → AgentCore Gateway (horizontal right)
arrow(*ir(AX, Y_MID), *il(AGX, Y_MID))

# 6. AgentCore Gateway → API Gateway (horizontal right)
arrow(*ir(AGX, Y_MID), *il(APIX, Y_MID))

# 7. API Gateway ← AgentCore Gateway (return, offset)
arrow(APIX, Y_MID+ICON*0.6, AGX+ICON, Y_MID+ICON*0.6)

# 8. API Gateway → Lambda (horizontal right)
arrow(*ir(APIX, Y_MID), *il(LX, Y_MID))

# 9. Lambda → API Gateway (return, offset)
arrow(LX, Y_MID+ICON*0.6, APIX+ICON, Y_MID+ICON*0.6)

# 10. Lambda → DynamoDB (horizontal right)
arrow(*ir(LX, Y_MID), *il(DBX, Y_MID))

# 11. Lambda ↑ Knowledge Base (vertical up)
arrow(*it(LX, Y_MID), *ib(KBX+ICON*0.5, Y_TOP))

# 12. Knowledge Base ↔ Nova Lite (horizontal bidirectional)
arrow(*ir(KBX, Y_TOP), *il(NLX, Y_TOP))                        # KB → Nova Lite
arrow(NLX, Y_TOP+ICON*0.6, KBX+ICON, Y_TOP+ICON*0.6)          # Nova Lite → KB

# 13. Browser → Live Agent (vertical down — call pickup)
arrow(*ib(CX, Y_MID), *it(CX, Y_BOT))

# ── NUMBERED CALLOUTS ─────────────────────────────────────────────────────────
circle(CX-Inches(0.15),  Y_TOP+Inches(0.10), 1)   # Cognito
circle(CX-Inches(0.15),  Y_MID+Inches(0.10), 2)   # Browser WebSocket
circle(NSX+Inches(0.45), Y_TOP-Inches(0.15), 3)   # Nova Sonic
circle(AX+Inches(0.45),  Y_MID-Inches(0.15), 4)   # AgentCore Runtime
circle(AGX+Inches(0.45), Y_MID-Inches(0.15), 5)   # AgentCore Gateway
circle(APIX-Inches(0.15),Y_MID-Inches(0.15), 6)   # API Gateway
circle(LX+Inches(0.45),  Y_MID-Inches(0.15), 7)   # Lambda → DynamoDB
circle(KBX-Inches(0.15), Y_TOP-Inches(0.15), 8)   # Knowledge Base
circle(CX-Inches(0.15),  Y_BOT+Inches(0.10), 9)   # Live Agent

# ── SAVE ──────────────────────────────────────────────────────────────────────
prs.save(OUT)
print(f"\nSaved: {OUT}")
print("Done!")
