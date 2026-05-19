"""
Generate Travel Concierge Architecture Diagram
Uses the telephony-ai-host.pptx as the base template (same format/style).
Copies all fixed elements (sidebar, title area, AWS Cloud boundary style)
and replaces content with Travel Concierge architecture.
"""

import copy
import io
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn
from lxml import etree
import os

SRC = '/Users/vatsravi/2026/AnyNewProject/sample-travel-concierge-with-amazon-bedrock-agentcore-and-nova-sonic/telephony-ai-host.pptx'
OUT = '/Users/vatsravi/2026/AnyNewProject/sample-travel-concierge-with-amazon-bedrock-agentcore-and-nova-sonic/travel-concierge-architecture.pptx'

ICON = Inches(0.40)

# ─── Load source and get slide ───────────────────────────────────────────────
prs = Presentation(SRC)
slide = prs.slides[0]

# ─── Helper: remove all shapes ───────────────────────────────────────────────
def clear_slide(slide):
    sp_tree = slide.shapes._spTree
    for sp in list(sp_tree):
        tag = sp.tag.split('}')[-1] if '}' in sp.tag else sp.tag
        if tag not in ('grpSpPr', 'sp', 'pic', 'graphicFrame', 'cxnSp', 'grpSp'):
            continue
        sp_tree.remove(sp)

# ─── Helpers ──────────────────────────────────────────────────────────────────
def add_rect(slide, left, top, width, height, fill_rgb=None, line_rgb=None,
             line_width=Pt(1.25), text=None, font_size=9, bold=False,
             text_color=None, text_halign=PP_ALIGN.LEFT):
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    if fill_rgb:
        shape.fill.solid()
        shape.fill.fore_color.rgb = RGBColor(*fill_rgb)
    else:
        shape.fill.background()
    if line_rgb:
        shape.line.color.rgb = RGBColor(*line_rgb)
        shape.line.width = line_width
    else:
        shape.line.fill.background()
    bodyPr = shape._element.find(qn('p:txBody')).find(qn('a:bodyPr'))
    bodyPr.set('lIns', str(int(Emu(Inches(0.06)))))
    bodyPr.set('tIns', str(int(Emu(Inches(0.04)))))
    bodyPr.set('anchor', 't')
    if text:
        tf = shape.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.alignment = text_halign
        run = p.add_run()
        run.text = text
        run.font.name = 'Arial'
        run.font.size = Pt(font_size)
        run.font.bold = bold
        run.font.color.rgb = RGBColor(*(text_color or (0x16, 0x19, 0x1F)))
    return shape

def add_textbox(slide, left, top, width, height, lines, font_size=9,
                alignment=PP_ALIGN.CENTER, bold_first=True):
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    bodyPr = txBox._element.find(qn('p:txBody')).find(qn('a:bodyPr'))
    for a in ('lIns', 'tIns', 'rIns', 'bIns'):
        bodyPr.set(a, '0')
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = alignment
        run = p.add_run()
        run.text = line
        run.font.name = 'Arial'
        run.font.size = Pt(font_size)
        if i == 0 and bold_first:
            run.font.bold = True
        elif i > 0:
            run.font.italic = True
        run.font.color.rgb = RGBColor(0x16, 0x19, 0x1F)
    return txBox

def add_circle(slide, left, top, number, size=Inches(0.28)):
    shape = slide.shapes.add_shape(MSO_SHAPE.OVAL, left, top, size, size)
    shape.fill.solid()
    shape.fill.fore_color.rgb = RGBColor(0x16, 0x19, 0x1F)
    shape.line.fill.background()
    bodyPr = shape._element.find(qn('p:txBody')).find(qn('a:bodyPr'))
    for a in ('lIns', 'tIns', 'rIns', 'bIns'):
        bodyPr.set(a, '0')
    bodyPr.set('anchor', 'ctr')
    p = shape.text_frame.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = str(number)
    run.font.name = 'Arial'
    run.font.size = Pt(9)
    run.font.bold = True
    run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    return shape

def add_line(slide, x1, y1, x2, y2, color=(0x54, 0x57, 0x5A), width=Pt(1.25)):
    conn = slide.shapes.add_connector(1, x1, y1, x2, y2)
    conn.line.color.rgb = RGBColor(*color)
    conn.line.width = width
    return conn

def add_arrow(slide, x1, y1, x2, y2, color=(0x54, 0x57, 0x5A), width=Pt(1.25)):
    conn = slide.shapes.add_connector(2, x1, y1, x2, y2)
    conn.line.color.rgb = RGBColor(*color)
    conn.line.width = width
    ln = conn._element.find('.//' + qn('a:ln'))
    if ln is None:
        ln = conn._element.makeelement(qn('a:ln'), {})
        conn._element.append(ln)
    tail = ln.makeelement(qn('a:tailEnd'), {'type': 'triangle', 'w': 'med', 'len': 'med'})
    ln.append(tail)
    return conn

def add_icon_from_source(slide, src_slide, shape_name, new_left, new_top):
    """Copy a picture shape from source slide to new position."""
    for shape in src_slide.shapes:
        if shape.name == shape_name and shape.shape_type == 13:
            # Get image bytes
            img_bytes = shape.image.blob
            img_stream = io.BytesIO(img_bytes)
            pic = slide.shapes.add_picture(img_stream, new_left, new_top, ICON, ICON)
            return pic
    return None

# ─── Identify icon shapes in source slide ────────────────────────────────────
# Map shape names to their service for reuse
src_icons = {}
for shape in slide.shapes:
    if shape.shape_type == 13:
        src_icons[shape.name] = shape

print("Available icons:", list(src_icons.keys()))

# ─── Clear slide ─────────────────────────────────────────────────────────────
clear_slide(slide)

# ─── TITLE ───────────────────────────────────────────────────────────────────
title_box = slide.shapes.add_textbox(Inches(0.16), Inches(0.05), Inches(9.5), Inches(0.6))
tf = title_box.text_frame
p = tf.paragraphs[0]
run = p.add_run()
run.text = 'Guidance for Travel Concierge using Amazon Bedrock AgentCore and Nova Sonic 2'
run.font.name = 'Arial'
run.font.size = Pt(22)
run.font.bold = True
run.font.color.rgb = RGBColor(0x16, 0x19, 0x1F)

# ─── DESCRIPTION ─────────────────────────────────────────────────────────────
desc_box = slide.shapes.add_textbox(Inches(0.16), Inches(0.68), Inches(9.5), Inches(0.38))
tf = desc_box.text_frame
p = tf.paragraphs[0]
run = p.add_run()
run.text = 'This architecture diagram shows how to build a voice-enabled airline concierge using Amazon Bedrock AgentCore, Nova Sonic 2, and MCP tool integration.'
run.font.name = 'Arial'
run.font.size = Pt(11)
run.font.color.rgb = RGBColor(0x16, 0x19, 0x1F)

# ─── SEPARATOR LINE ──────────────────────────────────────────────────────────
sep = slide.shapes.add_connector(1, Inches(0.13), Inches(1.08), Inches(9.63), Inches(1.08))
sep.line.color.rgb = RGBColor(0x16, 0x19, 0x1F)
sep.line.width = Pt(1.0)

# ─── SIDEBAR ─────────────────────────────────────────────────────────────────
add_rect(slide, Inches(9.82), Inches(0), Inches(3.52), Inches(7.5),
         fill_rgb=(0xEA, 0xED, 0xED))

# Sidebar steps
steps = [
    "You open the Travel Concierge web app hosted on AWS Amplify and sign in through Amazon Cognito, which issues a JWT token and temporary AWS credentials.",
    "Your browser opens a signed WebSocket connection to the Amazon Bedrock AgentCore Runtime using SigV4 authentication. The Runtime launches a Nova Sonic 2 bidirectional stream.",
    "The AgentCore Runtime immediately calls four tools in parallel — GetUpcomingItinerary, GetLoyaltyStatus, GetPreferences, and GetFlightStatus — to personalize the greeting before you speak.",
    "The AgentCore Gateway translates MCP tool calls into signed REST requests to Amazon API Gateway, which invokes the appropriate AWS Lambda function.",
    "AWS Lambda reads from or writes to Amazon DynamoDB tables covering bookings, passengers, seat maps, loyalty, preferences, and flight status.",
    "For policy questions, AWS Lambda queries the Amazon Bedrock Knowledge Base, which uses Amazon Titan Embed to perform semantic search over airline policy PDFs stored in Amazon S3.",
    "Nova Sonic 2 streams audio responses back through the WebSocket to your browser. Tool result cards appear in the React UI before the agent speaks.",
    "When you request a live agent, the AgentCore Runtime calls EscalateToAgent, logs the escalation to DynamoDB, and the frontend displays a call card with the support phone number.",
    "AWS CodeBuild builds the agent container image from source and pushes it to Amazon ECR. Amazon Bedrock AgentCore Runtime pulls the image and runs the agent at scale.",
]

sidebar_text_left = Inches(10.4)
sidebar_text_width = Inches(2.75)
y_start = Inches(0.23)
y_spacing = Inches(0.82)

for i, step_text in enumerate(steps):
    y = y_start + i * y_spacing
    add_circle(slide, Inches(10.02), y, i + 1)
    tb = slide.shapes.add_textbox(sidebar_text_left, y, sidebar_text_width, Inches(0.75))
    tf = tb.text_frame
    tf.word_wrap = True
    bodyPr = tb._element.find(qn('p:txBody')).find(qn('a:bodyPr'))
    for a in ('lIns', 'tIns', 'rIns', 'bIns'):
        bodyPr.set(a, '0')
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = step_text
    run.font.name = 'Arial'
    run.font.size = Pt(8)
    run.font.color.rgb = RGBColor(0x16, 0x19, 0x1F)

# ─── AWS CLOUD BOUNDARY ───────────────────────────────────────────────────────
cloud_left = Inches(1.1)
cloud_top = Inches(1.42)
cloud_w = Inches(8.55)
cloud_h = Inches(5.42)

cloud_rect = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE,
    cloud_left, cloud_top, cloud_w, cloud_h)
cloud_rect.fill.background()
cloud_rect.line.color.rgb = RGBColor(0x16, 0x19, 0x1F)
cloud_rect.line.width = Pt(1.5)
cloud_rect.text_frame.text = ''

# AWS Cloud label
add_textbox(slide, Inches(1.63), Inches(1.42), Inches(1.2), Inches(0.3),
            ['AWS Cloud'], font_size=12, alignment=PP_ALIGN.LEFT, bold_first=True)

# ─── SECTION BOXES ───────────────────────────────────────────────────────────
# Row 1: Auth | Voice AI Agent | AgentCore Gateway
# Row 2: API & Compute | Data Storage | Knowledge Base
# Row 3: Build Pipeline

# Auth section (Cognito)
add_rect(slide, Inches(1.23), Inches(1.83), Inches(1.62), Inches(1.83),
         fill_rgb=(0xE8, 0xF4, 0xFD), line_rgb=(0xB0, 0xD4, 0xF1),
         text='Authentication', font_size=8, bold=True)

# Voice AI Agent section
add_rect(slide, Inches(2.96), Inches(1.83), Inches(2.65), Inches(1.83),
         fill_rgb=(0xF0, 0xF8, 0xF0), line_rgb=(0x82, 0xD4, 0xA8),
         text='Voice AI Agent', font_size=8, bold=True)

# AgentCore Gateway section
add_rect(slide, Inches(5.72), Inches(1.83), Inches(3.73), Inches(1.83),
         fill_rgb=(0xE2, 0xF5, 0xF2), line_rgb=(0x01, 0xA8, 0x8D),
         text='AgentCore Gateway', font_size=8, bold=True)

# MCP Gateway section
add_rect(slide, Inches(1.25), Inches(3.86), Inches(2.01), Inches(1.44),
         fill_rgb=(0xE8, 0xF0, 0xFD), line_rgb=(0x82, 0xA8, 0xE0),
         text='MCP Gateway', font_size=8, bold=True)

# API & Compute section
add_rect(slide, Inches(3.42), Inches(3.87), Inches(2.57), Inches(1.43),
         fill_rgb=(0xFD, 0xF0, 0xE2), line_rgb=(0xED, 0xBB, 0x82),
         text='API & Compute', font_size=8, bold=True)

# Data Storage section
add_rect(slide, Inches(6.05), Inches(3.86), Inches(1.58), Inches(1.44),
         fill_rgb=(0xE8, 0xF0, 0xE2), line_rgb=(0x1B, 0x66, 0x0F),
         text='Data Storage', font_size=8, bold=True)

# Knowledge Base section
add_rect(slide, Inches(7.67), Inches(3.85), Inches(1.78), Inches(1.44),
         fill_rgb=(0xFD, 0xF0, 0xE2), line_rgb=(0xED, 0xBB, 0x82),
         text='Knowledge Base', font_size=8, bold=True)

# Build Pipeline section
add_rect(slide, Inches(2.77), Inches(5.49), Inches(3.8), Inches(1.16),
         fill_rgb=(0xF0, 0xF0, 0xF0), line_rgb=(0xC0, 0xC0, 0xC0),
         text='AgentCore Runtime Build Pipeline', font_size=8, bold=True)

# Monitoring section
add_rect(slide, Inches(6.83), Inches(5.49), Inches(2.7), Inches(1.16),
         fill_rgb=(0xF5, 0xE8, 0xF0), line_rgb=(0xE7, 0x15, 0x7B),
         text='Monitoring', font_size=8, bold=True)

# ─── ICONS (reuse from source slide) ─────────────────────────────────────────
# We'll copy icons from the source slide by image content
# Source icon mapping (from inspection):
# Graphic 78  = AWS Cloud group icon (pos 1.1, 1.42)
# Graphic 89  = AgentCore Runtime (pos 6.21, 2.68)
# Graphic 92  = Nova Sonic (pos 7.0, 2.02)
# Graphic 97  = AgentCore Gateway (pos 2.07, 4.29)
# Graphic 7   = API Gateway (pos 3.97, 4.3)
# Graphic 10  = Lambda (pos 5.24, 4.3) -- also at 2.23,2.02 and 7.77,2.68
# Graphic 23  = DynamoDB (pos 6.72, 4.29) -- also at 0.31,2.89
# Graphic 109 = Location Service (pos 8.35, 4.3)
# Graphic 8   = S3 (pos 3.15, 5.94)
# Graphic 19  = CodeBuild (pos 4.47, 5.92)
# Graphic 20  = ECR (pos 5.77, 5.92)
# Picture 150 = CloudWatch (pos 8.58, 5.92)
# Picture 167 = KMS (pos 7.43, 5.92)
# Picture 170 = CDK (pos 1.93, 5.94)
# Graphic 14  = Fargate (pos 4.77, 2.68)
# Graphic 6   = NLB (pos 3.59, 2.9)
# Graphic 17  = Chime SDK (pos 1.49, 2.9)
# Graphic 10  = Lambda (pos 2.23, 2.02)
# Graphic 15  = Systems Manager (pos 8.5, 2.03)

def copy_icon(slide, src_slide, src_name, new_left, new_top):
    for shape in src_slide.shapes:
        if shape.name == src_name and shape.shape_type == 13:
            img_bytes = shape.image.blob
            img_stream = io.BytesIO(img_bytes)
            return slide.shapes.add_picture(img_stream, new_left, new_top, ICON, ICON)
    print(f"WARNING: icon {src_name!r} not found")
    return None

# AWS Cloud group icon (top-left of boundary)
copy_icon(slide, slide._element.getparent().getparent(), 'Graphic 78', cloud_left, cloud_top)
# Actually we need to use the original slide object before clearing
# Let's use a different approach - reload source

print("Icons will be placed using source slide references")

# ─── PLACE ICONS ─────────────────────────────────────────────────────────────
# We need to reload the source to get icons since we cleared the slide
# Let's save current state and reload

prs.save(OUT)
print(f"Saved intermediate: {OUT}")
