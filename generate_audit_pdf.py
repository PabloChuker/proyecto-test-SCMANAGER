#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generador del informe de auditoría de base de datos Supabase — AL FILO Platform
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate
from reportlab.lib.units import mm
import datetime

# ─── COLORES ──────────────────────────────────────────────────────────────────
C_DARK   = colors.HexColor("#0F172A")   # slate-900
C_BLUE   = colors.HexColor("#3B82F6")   # blue-500
C_CYAN   = colors.HexColor("#06B6D4")   # cyan-500
C_GREEN  = colors.HexColor("#22C55E")   # green-500
C_YELLOW = colors.HexColor("#EAB308")   # yellow-500
C_RED    = colors.HexColor("#EF4444")   # red-500
C_ORANGE = colors.HexColor("#F97316")   # orange-500
C_GRAY   = colors.HexColor("#64748B")   # slate-500
C_LGRAY  = colors.HexColor("#E2E8F0")   # slate-200
C_HEADER = colors.HexColor("#1E293B")   # slate-800
C_ROW1   = colors.HexColor("#F8FAFC")   # slate-50
C_ROW2   = colors.white

OUTPUT = r"C:\Users\Usuario\Desktop\SCLabs\auditoria_supabase_alfilo.pdf"
PAGE_W, PAGE_H = A4
MARGIN = 2 * cm

# ─── ESTILOS ──────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

def make_style(name, parent="Normal", **kwargs):
    return ParagraphStyle(name, parent=styles[parent], **kwargs)

S = {
    "cover_title": make_style("cover_title", fontSize=28, textColor=C_BLUE,
                               leading=34, spaceAfter=8, fontName="Helvetica-Bold"),
    "cover_sub":   make_style("cover_sub",   fontSize=14, textColor=C_LGRAY,
                               leading=18, spaceAfter=6, fontName="Helvetica"),
    "cover_meta":  make_style("cover_meta",  fontSize=9,  textColor=C_GRAY,
                               leading=14, fontName="Helvetica"),
    "h1":    make_style("h1", fontSize=16, textColor=C_BLUE, leading=22,
                         spaceBefore=18, spaceAfter=8, fontName="Helvetica-Bold"),
    "h2":    make_style("h2", fontSize=12, textColor=C_HEADER, leading=17,
                         spaceBefore=12, spaceAfter=6, fontName="Helvetica-Bold"),
    "h3":    make_style("h3", fontSize=10, textColor=C_GRAY, leading=14,
                         spaceBefore=8, spaceAfter=4, fontName="Helvetica-Bold"),
    "body":  make_style("body",  fontSize=8.5, leading=13, textColor=C_DARK,
                         spaceAfter=4, fontName="Helvetica"),
    "small": make_style("small", fontSize=7.5, leading=11, textColor=C_GRAY,
                         fontName="Helvetica"),
    "code":  make_style("code",  fontSize=7, leading=10, textColor=C_HEADER,
                         fontName="Courier", backColor=C_LGRAY,
                         leftIndent=6, rightIndent=6, spaceBefore=4, spaceAfter=4),
    "th":    make_style("th", fontSize=7.5, textColor=colors.white, leading=10,
                         fontName="Helvetica-Bold", alignment=TA_LEFT),
    "td":    make_style("td", fontSize=7.5, textColor=C_DARK, leading=10,
                         fontName="Helvetica", alignment=TA_LEFT),
    "td_c":  make_style("td_c", fontSize=7.5, textColor=C_DARK, leading=10,
                         fontName="Helvetica", alignment=TA_CENTER),
    "badge_r": make_style("badge_r", fontSize=7.5, textColor=C_RED, leading=10,
                           fontName="Helvetica-Bold"),
    "badge_g": make_style("badge_g", fontSize=7.5, textColor=C_GREEN, leading=10,
                           fontName="Helvetica-Bold"),
    "badge_y": make_style("badge_y", fontSize=7.5, textColor=C_YELLOW, leading=10,
                           fontName="Helvetica-Bold"),
    "badge_o": make_style("badge_o", fontSize=7.5, textColor=C_ORANGE, leading=10,
                           fontName="Helvetica-Bold"),
    "warn":  make_style("warn", fontSize=8, textColor=C_RED, leading=12,
                         fontName="Helvetica-Bold", spaceBefore=4, spaceAfter=4),
    "note":  make_style("note", fontSize=8, textColor=C_ORANGE, leading=12,
                         fontName="Helvetica-Bold", spaceBefore=4, spaceAfter=4),
}

# ─── HELPERS ──────────────────────────────────────────────────────────────────
def hr(color=C_BLUE, thickness=0.5):
    return HRFlowable(width="100%", thickness=thickness, color=color, spaceAfter=6, spaceBefore=4)

def p(text, style="body"):
    return Paragraph(text, S[style])

def sp(h=6):
    return Spacer(1, h)

def section(title, level=1):
    s = "h1" if level == 1 else ("h2" if level == 2 else "h3")
    items = [p(title, s)]
    if level == 1:
        items.insert(0, hr())
    return items

def make_table(headers, rows, col_widths, zebra=True):
    header_row = [Paragraph(h, S["th"]) for h in headers]
    data = [header_row]
    for i, row in enumerate(rows):
        bg = C_ROW1 if (i % 2 == 0 and zebra) else C_ROW2
        cells = []
        for cell in row:
            if isinstance(cell, str):
                cells.append(Paragraph(cell, S["td"]))
            else:
                cells.append(cell)
        data.append(cells)

    style = TableStyle([
        ("BACKGROUND",    (0, 0), (-1,  0),  C_HEADER),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1),  [C_ROW1, C_ROW2]),
        ("GRID",          (0, 0), (-1, -1),  0.25, C_LGRAY),
        ("VALIGN",        (0, 0), (-1, -1),  "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1),  4),
        ("RIGHTPADDING",  (0, 0), (-1, -1),  4),
        ("TOPPADDING",    (0, 0), (-1, -1),  3),
        ("BOTTOMPADDING", (0, 0), (-1, -1),  3),
        ("ROWBACKGROUNDS",(0, 0), (-1,  0),  [C_HEADER]),
    ])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(style)
    return t

def badge(text, color):
    return Paragraph(f'<font color="#{color[1:] if color.startswith("#") else color}">{text}</font>',
                     ParagraphStyle("b", fontSize=7.5, fontName="Helvetica-Bold",
                                    leading=10, textColor=colors.HexColor(color) if color.startswith("#") else color))

# ─── HEADER / FOOTER ──────────────────────────────────────────────────────────
def on_page(canvas, doc):
    canvas.saveState()
    # Header bar
    canvas.setFillColor(C_DARK)
    canvas.rect(0, PAGE_H - 1.1*cm, PAGE_W, 1.1*cm, fill=1, stroke=0)
    canvas.setFillColor(C_BLUE)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(MARGIN, PAGE_H - 0.7*cm, "AUDITORÍA DE BASE DE DATOS SUPABASE")
    canvas.setFillColor(C_LGRAY)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 0.7*cm, "AL FILO Platform — Confidencial")

    # Footer
    canvas.setFillColor(C_LGRAY)
    canvas.rect(0, 0, PAGE_W, 0.9*cm, fill=1, stroke=0)
    canvas.setFillColor(C_GRAY)
    canvas.setFont("Helvetica", 7)
    canvas.drawString(MARGIN, 0.35*cm, f"SC Labs · Generado el {datetime.date.today().strftime('%d/%m/%Y')}")
    canvas.drawCentredString(PAGE_W/2, 0.35*cm, "Uso interno — No distribuir")
    canvas.drawRightString(PAGE_W - MARGIN, 0.35*cm, f"Página {doc.page}")
    canvas.restoreState()

# ─── CONTENIDO ────────────────────────────────────────────────────────────────
story = []

# ── PORTADA ───────────────────────────────────────────────────────────────────
story.append(Spacer(1, 3*cm))

# Logo block
logo_data = [
    [Paragraph('<font color="#3B82F6" size="22"><b>SC LABS</b></font>', ParagraphStyle("logo", fontSize=22, fontName="Helvetica-Bold", textColor=C_BLUE))],
]
lt = Table(logo_data, colWidths=[PAGE_W - 2*MARGIN])
lt.setStyle(TableStyle([
    ("ALIGN", (0,0), (-1,-1), "CENTER"),
    ("BACKGROUND", (0,0), (-1,-1), C_DARK),
    ("TOPPADDING", (0,0), (-1,-1), 20),
    ("BOTTOMPADDING", (0,0), (-1,-1), 20),
    ("ROUNDEDCORNERS", [6]),
]))
story.append(lt)
story.append(sp(30))

story.append(p("AUDITORÍA DE BASE DE DATOS", "cover_sub"))
story.append(p("Supabase — AL FILO Platform", "cover_title"))
story.append(hr(C_BLUE, 1.5))
story.append(sp(12))

meta_data = [
    ["Fecha", "11 de abril de 2026"],
    ["Proyecto", "AL FILO Platform (Star Citizen fleet manager)"],
    ["Versión del juego ref.", "Star Citizen 4.7.1-live.11592622"],
    ["Base de datos", "Supabase PostgreSQL (aws-1-us-west-2)"],
    ["Stack", "Next.js 16 · React 19 · TypeScript · postgres.js v3"],
    ["Branch analizado", "master"],
    ["Clasificación", "USO INTERNO — No distribuir externamente"],
]
mt = Table(meta_data, colWidths=[4.5*cm, PAGE_W - 2*MARGIN - 4.5*cm])
mt.setStyle(TableStyle([
    ("FONTNAME",      (0,0), (0,-1), "Helvetica-Bold"),
    ("FONTNAME",      (1,0), (1,-1), "Helvetica"),
    ("FONTSIZE",      (0,0), (-1,-1), 8.5),
    ("TEXTCOLOR",     (0,0), (0,-1), C_GRAY),
    ("TEXTCOLOR",     (1,0), (1,-1), C_DARK),
    ("GRID",          (0,0), (-1,-1), 0.25, C_LGRAY),
    ("ROWBACKGROUNDS",(0,0), (-1,-1), [C_ROW1, C_ROW2]),
    ("TOPPADDING",    (0,0), (-1,-1), 5),
    ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ("LEFTPADDING",   (0,0), (-1,-1), 8),
]))
story.append(mt)
story.append(PageBreak())

# ── 1. RESUMEN EJECUTIVO ──────────────────────────────────────────────────────
story += section("1. Resumen Ejecutivo")

# KPI cards
kpis = [
    ("75", "Tablas totales\nen Supabase", C_BLUE),
    ("38", "Tablas usadas\nactivamente", C_GREEN),
    ("23", "Tablas con datos\nsin uso en código", C_YELLOW),
    ("15", "Tablas vacías\nsin uso", C_GRAY),
    ("1 CRÍTICO", "Tabla en migración\nausenteen DB", C_RED),
    ("12", "Archivos JSON\ncomo fuente datos", C_ORANGE),
    ("6", "Duplicidades\nJSON vs DB", C_RED),
]

kpi_rows = []
row = []
for i, (val, label, col) in enumerate(kpis):
    cell_data = [
        [Paragraph(f'<font color="#{col.hexval()[2:]}"><b>{val}</b></font>',
                   ParagraphStyle("kv", fontSize=16, fontName="Helvetica-Bold",
                                  textColor=col, alignment=TA_CENTER, leading=20))],
        [Paragraph(label.replace("\n", "<br/>"),
                   ParagraphStyle("kl", fontSize=7, fontName="Helvetica",
                                  textColor=C_GRAY, alignment=TA_CENTER, leading=10))],
    ]
    inner = Table(cell_data, colWidths=[3.5*cm])
    inner.setStyle(TableStyle([
        ("ALIGN",       (0,0), (-1,-1), "CENTER"),
        ("BACKGROUND",  (0,0), (-1,-1), C_ROW1),
        ("BOX",         (0,0), (-1,-1), 1, col),
        ("TOPPADDING",  (0,0), (-1,-1), 8),
        ("BOTTOMPADDING",(0,0),(-1,-1), 8),
    ]))
    row.append(inner)
    if len(row) == 4 or i == len(kpis)-1:
        while len(row) < 4:
            row.append("")
        kpi_rows.append(row)
        row = []

kt = Table(kpi_rows, colWidths=[3.7*cm]*4)
kt.setStyle(TableStyle([
    ("ALIGN",   (0,0), (-1,-1), "CENTER"),
    ("VALIGN",  (0,0), (-1,-1), "MIDDLE"),
    ("LEFTPADDING",  (0,0), (-1,-1), 4),
    ("RIGHTPADDING", (0,0), (-1,-1), 4),
    ("TOPPADDING",   (0,0), (-1,-1), 4),
    ("BOTTOMPADDING",(0,0), (-1,-1), 4),
]))
story.append(kt)
story.append(sp(12))

story += section("Riesgos Principales", 2)

risks = [
    ("🔴 CRÍTICO", "`referral_visits` no existe en la DB",
     "La migración está creada en prisma/migrations/ pero nunca fue aplicada. El endpoint POST /api/referral/track falla en producción con error SQL 42P01."),
    ("🔴 PELIGROSO", "Doble fuente de verdad en Crafting",
     "useCraftingData.ts importa JSON locales mientras las APIs /api/crafting/* sirven datos desde la DB. La UI puede mostrar datos distintos a lo que tiene Supabase."),
    ("🔴 PELIGROSO", "Doble fuente de verdad en Actividades",
     "ActivityManager.tsx importa activity-types.json y loot-items.json directamente, ignorando las tablas activity_types (13 filas) y loot_items (132 filas) de la DB."),
    ("🟡 IMPORTANTE", "Módulo de minería ignora la DB",
     "mining_resources (69 filas en DB) está completamente ignorada. Todo el módulo de minería usa minerals.json. Desincronización probable con datos del juego."),
    ("🟡 IMPORTANTE", "23 tablas con datos sin consumidor",
     "Tablas como turrets (270 filas), fuel_intakes (144), ship_insurance (293), ship_resistances (293) tienen datos completos pero ningún endpoint los accede."),
    ("⚪ DEUDA", "15 tablas vacías sin uso",
     "Módulos nunca implementados (tiendas, thrusters, scanners, paints) generan ruido en el schema y ocupan espacio de índices."),
]

risk_rows = [[p(s, "warn" if "CRÍTICO" in s or "PELIGROSO" in s else ("note" if "IMPORTANTE" in s else "small")),
              p(t, "h3"), p(d, "body")]
             for s, t, d in risks]

rt = Table([[p("Nivel", "th"), p("Problema", "th"), p("Descripción", "th")]] +
           [[Paragraph(s, ParagraphStyle("rs", fontSize=7.5, fontName="Helvetica-Bold",
                        textColor=C_RED if "CRÍTICO" in s or "PELIGROSO" in s
                        else (C_YELLOW if "IMPORTANTE" in s else C_GRAY), leading=10)),
             p(t, "h3"), p(d, "body")] for s, t, d in risks],
           colWidths=[2.2*cm, 4.5*cm, PAGE_W - 2*MARGIN - 6.7*cm],
           repeatRows=1)
rt.setStyle(TableStyle([
    ("BACKGROUND",    (0, 0), (-1,  0), C_HEADER),
    ("ROWBACKGROUNDS",(0, 1), (-1, -1), [C_ROW1, C_ROW2]),
    ("GRID",          (0, 0), (-1, -1), 0.25, C_LGRAY),
    ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING",   (0, 0), (-1, -1), 6),
    ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
    ("TOPPADDING",    (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
]))
story.append(rt)
story.append(PageBreak())

# ── 2. INVENTARIO DE TABLAS ───────────────────────────────────────────────────
story += section("2. Inventario Completo de Tablas")
story += section("2.1 Tablas activamente usadas (38)", 2)

usadas_headers = ["Tabla", "Filas", "Tamaño", "Endpoints / Módulos consumidores"]
usadas_rows = [
    ("ships",                "293",   "312 kB", "/api/ships · /api/ships/[id] · /api/ships/compare · /api/ccu/ships · /api/ccu/prices"),
    ("ship_flight_stats",    "293",   "320 kB", "/api/ships · /api/ships/[id] · /api/ships/compare"),
    ("ship_fuel",            "293",   "160 kB", "/api/ships/[id] · /api/ships/compare"),
    ("ship_hardpoints",      "12.312","6.7 MB", "/api/ships/[id] · /api/ships/compare"),
    ("weapon_guns",          "180",   "1 MB",   "/api/ships/[id] · /api/ships/compare · /api/components · /api/catalog"),
    ("shields",              "66",    "1 MB",   "/api/ships/[id] · /api/ships/compare · /api/components · /api/catalog"),
    ("power_plants",         "77",    "1.2 MB", "/api/ships/[id] · /api/ships/compare · /api/components · /api/catalog"),
    ("coolers",              "73",    "768 kB", "/api/ships/[id] · /api/ships/compare · /api/components · /api/catalog"),
    ("quantum_drives",       "62",    "400 kB", "/api/ships/[id] · /api/ships/compare · /api/components · /api/catalog"),
    ("missiles",             "64",    "312 kB", "/api/ships/compare · /api/components · /api/catalog"),
    ("cargo_grids",          "132",   "112 kB", "/api/cargo-grids → CargoGrid3D.tsx"),
    ("ccu_prices",           "35.254","17 MB",  "/api/ccu/prices · /api/ccu/calculate → CCUChainCalculator"),
    ("ship_loaners",         "112",   "112 kB", "/api/loaners → lib/loaners.ts → ShipContextMenu"),
    ("blueprints",           "1.044", "640 kB", "/api/crafting/blueprints"),
    ("blueprint_materials",  "3.944", "1.2 MB", "/api/crafting/blueprints · /api/crafting/materials"),
    ("blueprint_rewardpool", "394",   "160 kB", "/api/crafting/blueprints"),
    ("resources",            "194",   "152 kB", "/api/crafting/blueprints · /api/crafting/materials"),
    ("resources_box_sizes",  "1.314", "264 kB", "/api/crafting/blueprints · /api/crafting/materials"),
    ("mining_lasers",        "13",    "32 kB",  "/api/mining/lasers"),
    ("trade_commodities",    "191",   "96 kB",  "/api/trade/commodities · /api/trade/routes · /api/trade/filters"),
    ("trade_terminals",      "185",   "120 kB", "/api/trade/terminals · /api/trade/routes · /api/trade/filters"),
    ("trade_prices",         "2.330", "536 kB", "/api/trade/routes → TradeRoutes.tsx"),
    ("trade_star_systems",   "3",     "32 kB",  "FK trade_terminals · /api/trade/filters"),
    ("trade_planets",        "10",    "32 kB",  "FK trade_terminals (uso indirecto)"),
    ("activity_types",       "13",    "32 kB",  "/api/activities/types (+ fallback JSON)"),
    ("loot_items",           "132",   "64 kB",  "/api/activities/loot (+ fallback JSON)"),
    ("activity_sessions",    "0",     "216 kB", "ActivityManager.tsx (escribe, tabla vacía)"),
    ("profiles",             "6",     "48 kB",  "AuthContext · friends · org · party · profile · NotificationBell"),
    ("friendships",          "8",     "48 kB",  "friends/page · party/page · NotificationBell"),
    ("parties",              "2",     "32 kB",  "party/page · NotificationBell"),
    ("party_members",        "6",     "32 kB",  "party/page · NotificationBell"),
    ("organizations",        "1",     "48 kB",  "org/page"),
    ("org_members",          "3",     "32 kB",  "org/page · NotificationBell"),
    ("notifications",        "13",    "64 kB",  "NotificationBell · lib/notifications.ts"),
    ("user_inventory",       "4",     "64 kB",  "InventoryTab · LoadoutsTab · ComponentContextMenu"),
    ("user_loadouts",        "7",     "48 kB",  "LoadoutsTab · LoadoutBuilder"),
    ("loadout_items",        "191",   "96 kB",  "LoadoutsTab · LoadoutBuilder"),
    ("user_wishlist",        "11",    "64 kB",  "WishlistTab · LoadoutsTab · ComponentContextMenu · ActivityManager"),
]
story.append(make_table(usadas_headers, usadas_rows,
    [4.2*cm, 1.5*cm, 1.8*cm, PAGE_W - 2*MARGIN - 7.5*cm]))
story.append(sp(10))

story += section("2.2 Tablas con datos — SIN USO desde el código (23)", 2)
story.append(p("Estas tablas tienen datos pero ningún módulo del código las consulta ni escribe:", "body"))
story.append(sp(4))

no_uso_headers = ["Tabla", "Filas", "Tamaño", "Observación"]
no_uso_rows = [
    ("armors",                    "89",  "160 kB", "Datos de sc-unpacked. Sin endpoint ni query."),
    ("containers",                "22",  "64 kB",  "Sin consumidor."),
    ("emps",                      "7",   "64 kB",  "Sin consumidor."),
    ("flair_cockpit_items",       "11",  "64 kB",  "Módulo de decoración nunca implementado."),
    ("flair_floor_items",         "18",  "112 kB", "Idem."),
    ("flair_surface_items",       "61",  "280 kB", "Idem."),
    ("flair_wall_items",          "26",  "128 kB", "Idem."),
    ("flight_controllers",        "209", "1.4 MB", "Sin query en ningún endpoint activo."),
    ("fuel_intakes",              "144", "280 kB", "ship_hardpoints las referencia por tipo, pero no se batch-fetcha la tabla."),
    ("fuel_tanks",                "165", "344 kB", "Idem."),
    ("game_versions",             "1",   "48 kB",  "Sin consumidor."),
    ("life_support_generators",   "13",  "192 kB", "Sin consumidor."),
    ("manufacturers",             "137", "88 kB",  "FK desde ships.manufacturer_id pero ships.manufacturer (TEXT) esta denormalizado. Nunca se hace JOIN."),
    ("mining_resources",          "69",  "96 kB",  "DUPLICADO con minerals.json. Todo el modulo de mineria usa el JSON."),
    ("missile_launchers",         "125", "408 kB", "Se usan missiles (tabla), no missile_launchers."),
    ("quantum_fuel_tanks",        "136", "304 kB", "Sin consumidor."),
    ("quantum_interdiction_generators","6","152 kB","Sin consumidor."),
    ("radars",                    "67",  "328 kB", "Sin consumidor."),
    ("self_destruct_systems",     "7",   "88 kB",  "Sin consumidor."),
    ("ship_insurance",            "293", "120 kB", "293 filas (una por nave). Ningun endpoint la accede."),
    ("ship_resistances",          "293", "160 kB", "Idem."),
    ("turrets",                   "270", "952 kB", "La tabla mas grande sin consumidor. 270 filas ignoradas."),
    ("weapon_defensives",         "148", "168 kB", "Sin consumidor."),
]
story.append(make_table(no_uso_headers, no_uso_rows,
    [4.2*cm, 1.3*cm, 1.7*cm, PAGE_W - 2*MARGIN - 7.2*cm]))
story.append(PageBreak())

story += section("2.3 Tablas vacías — sin datos y sin uso (15)", 2)
vacias_headers = ["Tabla", "Tamaño", "Estado"]
vacias_rows = [
    ("locations",          "24 kB",  "Vacia. FK desde shops (tambien vacia). Modulo de tiendas nunca implementado."),
    ("main_thrusters",     "40 kB",  "Vacia. Sin queries."),
    ("manneuver_thrusters","40 kB",  "Vacia. Sin queries."),
    ("mining_stats",       "24 kB",  "Vacia. Sin queries."),
    ("missile_stats",      "24 kB",  "Vacia. Sin queries."),
    ("paints",             "48 kB",  "Vacia. Sin queries."),
    ("price_history",      "24 kB",  "Tabla definida en migracion 20260407. Vacia; estructura correcta pero nunca se escribe."),
    ("scanners",           "40 kB",  "Vacia. Sin queries."),
    ("ship_thrusters",     "16 kB",  "Vacia. Tiene FK desde ships. Sin queries."),
    ("shop_inventory",     "32 kB",  "Vacia. FK desde shops."),
    ("shops",              "32 kB",  "Vacia. FK desde locations."),
    ("thruster_stats",     "24 kB",  "Vacia. Sin queries."),
    ("transponders",       "40 kB",  "Vacia. Sin queries."),
    ("weapon_attachments", "48 kB",  "Vacia. Sin queries."),
]
story.append(make_table(vacias_headers, vacias_rows,
    [4.5*cm, 1.8*cm, PAGE_W - 2*MARGIN - 6.3*cm]))
story.append(sp(10))

story += section("2.4 Tabla en migración pero AUSENTE en la DB (CRITICO)", 2)
story.append(p('<font color="#EF4444"><b>ATENCION:</b></font> La siguiente tabla aparece en una migracion SQL pero NO existe en Supabase. Cualquier request al endpoint asociado devuelve un error 500 en produccion.', "body"))
story.append(sp(4))

crit_data = [
    [p("Tabla", "th"), p("Migracion", "th"), p("Endpoint afectado", "th"), p("Error esperado", "th")],
    [p("referral_visits", "td"), p("prisma/migrations/20260410_streamers_referrals/", "small"),
     p("POST /api/referral/track", "td"), p("relation 'referral_visits' does not exist (42P01)", "badge_r")],
]
ct = Table(crit_data, colWidths=[3.5*cm, 5*cm, 4.5*cm, PAGE_W - 2*MARGIN - 13*cm])
ct.setStyle(TableStyle([
    ("BACKGROUND",   (0,0), (-1, 0), C_HEADER),
    ("BACKGROUND",   (0,1), (-1,-1), colors.HexColor("#FEF2F2")),
    ("BOX",          (0,0), (-1,-1), 1.5, C_RED),
    ("GRID",         (0,0), (-1,-1), 0.25, C_LGRAY),
    ("VALIGN",       (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING",  (0,0), (-1,-1), 6),
    ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ("TOPPADDING",   (0,0), (-1,-1), 5),
    ("BOTTOMPADDING",(0,0), (-1,-1), 5),
]))
story.append(ct)
story.append(PageBreak())

# ── 3. MÓDULOS Y ACCESOS ──────────────────────────────────────────────────────
story += section("3. Modulos y sus Accesos a Datos")
story += section("3.1 Endpoints API (postgres.js via sql de @/lib/db)", 2)

api_headers = ["Endpoint", "Tablas", "Tipo"]
api_rows = [
    ("GET /api/ships",                     "ships · ship_flight_stats",  "SELECT"),
    ("GET /api/ships/[id]",                "ships · ship_flight_stats · ship_fuel · ship_hardpoints · weapon_guns · shields · power_plants · coolers · quantum_drives", "SELECT"),
    ("GET POST /api/ships/compare",        "ships · ship_flight_stats · ship_fuel · ship_hardpoints · weapon_guns · shields · power_plants · coolers · quantum_drives", "SELECT"),
    ("GET /api/ccu/ships",                 "ships",                       "SELECT"),
    ("GET /api/ccu/prices",                "ccu_prices · ships (x2 JOIN)","SELECT · UPDATE"),
    ("GET /api/ccu/calculate",             "ccu_prices",                  "SELECT"),
    ("GET POST /api/components",           "weapon_guns · missiles · shields · power_plants · coolers · quantum_drives", "SELECT"),
    ("GET /api/components/browse",         "weapon_guns · missiles · shields · power_plants · coolers · quantum_drives", "SELECT"),
    ("GET POST /api/catalog",              "weapon_guns · missiles · shields · power_plants · coolers · quantum_drives", "SELECT"),
    ("GET /api/cargo-grids",               "cargo_grids",                 "SELECT"),
    ("GET /api/crafting/blueprints",       "blueprints · blueprint_materials · resources · resources_box_sizes · blueprint_rewardpool", "SELECT"),
    ("GET /api/crafting/materials",        "resources · blueprint_materials · resources_box_sizes", "SELECT"),
    ("GET /api/mining/lasers",             "mining_lasers",               "SELECT"),
    ("GET POST /api/trade/terminals",      "trade_terminals",             "SELECT"),
    ("GET POST /api/trade/commodities",    "trade_commodities",           "SELECT"),
    ("GET /api/trade/routes",              "trade_commodities · trade_prices · trade_terminals", "SELECT"),
    ("GET /api/trade/filters",             "trade_terminals · trade_commodities", "SELECT"),
    ("GET /api/activities/types",          "activity_types",              "SELECT + fallback JSON"),
    ("GET /api/activities/loot",           "loot_items",                  "SELECT + fallback JSON"),
    ("GET /api/loaners",                   "ship_loaners",                "SELECT"),
    ("POST /api/referral/track",           "referral_visits (AUSENTE)",   "INSERT — FALLA EN PROD"),
]
story.append(make_table(api_headers, api_rows,
    [5*cm, 7.5*cm, PAGE_W - 2*MARGIN - 12.5*cm]))
story.append(sp(10))

story += section("3.2 Componentes React / Paginas (Supabase JS client)", 2)

client_headers = ["Modulo / Archivo", "Tablas", "Operaciones"]
client_rows = [
    ("AuthContext.tsx",              "profiles",                                           "SELECT · INSERT"),
    ("friends/page.tsx",             "profiles · friendships",                            "SELECT · INSERT · DELETE"),
    ("party/page.tsx",               "parties · party_members · profiles · friendships",  "SELECT · INSERT · UPDATE · DELETE"),
    ("ActivityManager.tsx",          "activity_sessions · party_members · parties · profiles · user_wishlist", "SELECT · INSERT · UPDATE"),
    ("profile/page.tsx",             "profiles",                                           "SELECT"),
    ("org/page.tsx",                 "organizations · org_members · profiles",             "SELECT · INSERT · UPDATE"),
    ("NotificationBell.tsx",         "notifications · profiles · friendships · parties · party_members · org_members", "SELECT · UPDATE · DELETE · INSERT"),
    ("lib/notifications.ts",         "notifications",                                      "INSERT"),
    ("InventoryTab.tsx",             "user_inventory",                                     "SELECT · INSERT · UPDATE · DELETE"),
    ("LoadoutsTab.tsx",              "user_loadouts · loadout_items · user_inventory · user_wishlist", "SELECT · INSERT · UPDATE · DELETE"),
    ("WishlistTab.tsx",              "user_wishlist",                                      "SELECT · INSERT · UPDATE · DELETE"),
    ("LoadoutBuilder.tsx",           "user_loadouts · loadout_items",                      "INSERT"),
    ("ComponentContextMenu.tsx",     "user_inventory · user_wishlist",                     "SELECT · INSERT · UPDATE"),
]
story.append(make_table(client_headers, client_rows,
    [5*cm, 6.5*cm, PAGE_W - 2*MARGIN - 11.5*cm]))
story.append(PageBreak())

story += section("3.3 Modulos que usan JSON como fuente de datos", 2)

json_mod_headers = ["Modulo / Archivo", "JSON utilizado", "Tabla DB equiv.", "Estado"]
json_mod_rows = [
    ("ActivityManager.tsx",           "activity-types.json\nloot-items.json",
     "activity_types\nloot_items",     "PELIGROSO\nDoble fuente"),
    ("RockCalculator.tsx",            "minerals.json",
     "mining_resources",               "PELIGROSO\nDB ignorada"),
    ("WorkOrderCalculator.tsx",       "minerals.json\nrefineries.json\nrefining-methods.json",
     "mining_resources\n(sin equiv.)\n(sin equiv.)",  "PELIGROSO\nDB ignorada"),
    ("RefineryDataTable.tsx",         "minerals.json\nrefineries.json",
     "mining_resources\n(sin equiv.)", "PELIGROSO\nDB ignorada"),
    ("MiningLoadoutCalculator.tsx",   "mining-modules.json",
     "(sin tabla equiv.)",             "CORRECTO\nfuente valida"),
    ("ComponentPicker.tsx",           "power-network-lookup.json",
     "(sin tabla equiv.)",             "CORRECTO\nfuente valida"),
    ("/api/ships/[id]/route.ts",      "power-network-lookup.json\nship-power-data.json",
     "(sin tabla equiv.)",             "CORRECTO\nfuente valida"),
    ("useCraftingData.ts",            "blueprints.json\nmaterials.json\ncategories.json",
     "blueprints + blueprint_materials\nresources\n(sin equiv.)",  "PELIGROSO\nDoble fuente"),
]

jmt_data = [[p("Modulo / Archivo", "th"), p("JSON utilizado", "th"),
              p("Tabla DB equiv.", "th"), p("Estado", "th")]]
for mod, json_f, db, estado in json_mod_rows:
    color = C_RED if "PELIGROSO" in estado else C_GREEN
    jmt_data.append([
        p(mod, "small"),
        p(json_f.replace("\n","<br/>"), "small"),
        p(db.replace("\n","<br/>"), "small"),
        Paragraph(f'<font color="#{color.hexval()[2:]}"><b>{estado.split(chr(10))[0]}</b></font><br/>'
                  f'<font color="#64748B" size="7">{estado.split(chr(10))[1]}</font>',
                  ParagraphStyle("es", fontSize=7.5, fontName="Helvetica", leading=10)),
    ])

jmt = Table(jmt_data, colWidths=[4.5*cm, 4*cm, 4*cm, PAGE_W - 2*MARGIN - 12.5*cm])
jmt.setStyle(TableStyle([
    ("BACKGROUND",    (0,0), (-1, 0), C_HEADER),
    ("ROWBACKGROUNDS",(0,1), (-1,-1), [C_ROW1, C_ROW2]),
    ("GRID",          (0,0), (-1,-1), 0.25, C_LGRAY),
    ("VALIGN",        (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING",   (0,0), (-1,-1), 5),
    ("RIGHTPADDING",  (0,0), (-1,-1), 5),
    ("TOPPADDING",    (0,0), (-1,-1), 4),
    ("BOTTOMPADDING", (0,0), (-1,-1), 4),
]))
story.append(jmt)
story.append(PageBreak())

# ── 4. COLUMNAS USADAS VS NO USADAS ──────────────────────────────────────────
story += section("4. Columnas Usadas vs No Usadas (tablas clave)")

col_sections = [
    ("ships", [
        ("id",              True,  "PK en todos los endpoints"),
        ("reference",       True,  "Busqueda, JOIN con ship_hardpoints"),
        ("name",            True,  "Busqueda, listado"),
        ("manufacturer",    True,  "Filtro, listado (TEXT denormalizado)"),
        ("manufacturer_id", None,  "FK a manufacturers, pero manufacturers nunca se consulta"),
        ("role",            True,  "Filtro, listado"),
        ("size",            True,  "Filtro, listado"),
        ("max_crew",        True,  "Listado, comparacion"),
        ("mass",            True,  "Listado, comparacion"),
        ("cargo_capacity",  True,  "Filtro, listado"),
        ("game_version",    True,  "Listado"),
        ("msrp_usd",        True,  "CCU, listado, filtro"),
        ("warbond_usd",     True,  "CCU, listado"),
        ("is_ccu_eligible", True,  "/api/ccu/ships"),
        ("is_limited",      True,  "/api/ccu/ships"),
        ("flight_status",   True,  "/api/ccu/ships"),
    ]),
    ("ship_insurance — TABLA IGNORADA", [
        ("TODAS (ship_id, claim_time, expedited_time, expedited_cost, ...)", False, "293 filas, ningun SELECT en el codigo"),
    ]),
    ("ship_resistances — TABLA IGNORADA", [
        ("TODAS (ship_id, phys_resistance, energy_resistance, ...)", False, "293 filas, ningun SELECT en el codigo"),
    ]),
    ("manufacturers — TABLA IGNORADA", [
        ("TODAS (id, name, code, logo_url, ...)", False, "137 filas, ships.manufacturer esta denormalizado como TEXT"),
    ]),
    ("trade_commodities", [
        ("id, name, code, kind",                            True,  "Listado y filtro"),
        ("price_buy, price_sell",                           True,  "Rutas de comercio"),
        ("is_raw, is_illegal, is_mineral, is_refined, is_harvestable, is_buyable, is_sellable", True, "Filtros booleanos"),
        ("weight_scu",                                      True,  "Rutas de comercio"),
        ("id_parent",                                       None,  "Existe en schema, no se ve en queries activas"),
        ("wiki",                                            False, "No se usa en el frontend"),
        ("date_added, date_modified",                       False, "No se usan en el frontend"),
    ]),
    ("ccu_prices", [
        ("id, from_ship_id, to_ship_id",                    True,  "Identificacion y JOIN con ships"),
        ("standard_price, warbond_price",                   True,  "Calculo de upgrade"),
        ("is_available, is_warbond_available, is_limited",  True,  "Filtrado"),
        ("source, last_verified",                           True,  "Actualizado via PATCH desde UI"),
        ("created_at, updated_at",                          True,  "Auditoria"),
    ]),
    ("price_history — TABLA VACIA", [
        ("ship_id, msrp_usd, warbond_usd, recorded_at, event_name, notes", False, "0 filas. Estructura correcta pero nunca se escribe"),
    ]),
]

for tname, cols in col_sections:
    story.append(KeepTogether([
        p(tname, "h3"),
    ]))
    col_data = [[p("Columna", "th"), p("Usada", "th"), p("Contexto", "th")]]
    for col, used, ctx in cols:
        if used is True:
            used_cell = Paragraph('<font color="#22C55E"><b>SI</b></font>',
                                   ParagraphStyle("u", fontSize=7.5, fontName="Helvetica-Bold", leading=10))
        elif used is False:
            used_cell = Paragraph('<font color="#EF4444"><b>NO</b></font>',
                                   ParagraphStyle("u", fontSize=7.5, fontName="Helvetica-Bold", leading=10))
        else:
            used_cell = Paragraph('<font color="#EAB308"><b>PARCIAL</b></font>',
                                   ParagraphStyle("u", fontSize=7.5, fontName="Helvetica-Bold", leading=10))
        col_data.append([p(col, "small"), used_cell, p(ctx, "small")])
    ct2 = Table(col_data, colWidths=[6*cm, 1.8*cm, PAGE_W - 2*MARGIN - 7.8*cm])
    ct2.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1, 0), C_HEADER),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [C_ROW1, C_ROW2]),
        ("GRID",          (0,0), (-1,-1), 0.25, C_LGRAY),
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING",   (0,0), (-1,-1), 5),
        ("RIGHTPADDING",  (0,0), (-1,-1), 5),
        ("TOPPADDING",    (0,0), (-1,-1), 3),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
    ]))
    story.append(ct2)
    story.append(sp(8))

story.append(PageBreak())

# ── 5. JSON vs DB ─────────────────────────────────────────────────────────────
story += section("5. Redundancias JSON vs DB")

red_headers = ["JSON", "Tabla DB", "Modulo afectado", "Clasificacion", "Riesgo"]
red_rows = [
    ("activity-types.json\n(src/data/activities/)",
     "activity_types\n(13 filas)",
     "ActivityManager.tsx\n(import directo)",
     "PELIGROSO",
     "ActivityManager ignora la API y usa JSON. Si se actualiza la tabla, la UI no lo refleja."),
    ("loot-items.json\n(src/data/activities/)",
     "loot_items\n(132 filas)",
     "ActivityManager.tsx\n(import directo)",
     "PELIGROSO",
     "Idem anterior."),
    ("blueprints.json\nmaterials.json\n(src/data/crafting/)",
     "blueprints (1.044 f.)\nresources (194 f.)",
     "useCraftingData.ts",
     "PELIGROSO",
     "La UI de crafting puede mostrar datos distintos a lo que tiene la DB (que tiene JOINs enriquecidos)."),
    ("minerals.json\n(src/data/mining/)",
     "mining_resources\n(69 filas)",
     "RockCalculator\nWorkOrderCalculator\nRefineryDataTable",
     "MEJOR MIGRAR\nA DB",
     "JSON tiene campos adicionales (tier, basePrice, abbr) que la tabla puede no tener. Desincronizacion probable."),
    ("mining-lasers.json\n(src/data/mining/)",
     "mining_lasers\n(13 filas)",
     "(no imports activos\ndetectados)",
     "REDUNDANTE",
     "JSON legacy. El endpoint /api/mining/lasers ya serve la DB. Verificar si algun componente sigue importando el JSON."),
    ("data/trade-cache/*.json\n(terminales, commodities, etc.)",
     "trade_* tables",
     "(no importados\nen runtime)",
     "CORRECTO",
     "Son snapshots de seed de UEX. No se importan en runtime. Son el origen historico de los datos en DB."),
]

rrt_data = [[p(h, "th") for h in red_headers]]
for json_f, db, mod, clasif, riesgo in red_rows:
    color = C_RED if "PELIGROSO" in clasif else (C_YELLOW if "MIGRAR" in clasif else (C_ORANGE if "REDUNDANTE" in clasif else C_GREEN))
    rrt_data.append([
        p(json_f.replace("\n","<br/>"), "small"),
        p(db.replace("\n","<br/>"), "small"),
        p(mod.replace("\n","<br/>"), "small"),
        Paragraph(f'<font color="#{color.hexval()[2:]}"><b>{clasif.replace(chr(10),"<br/>")}</b></font>',
                  ParagraphStyle("cs", fontSize=7.5, fontName="Helvetica-Bold", leading=10)),
        p(riesgo, "small"),
    ])

rrt = Table(rrt_data, colWidths=[3.5*cm, 2.8*cm, 3*cm, 2.2*cm, PAGE_W - 2*MARGIN - 11.5*cm])
rrt.setStyle(TableStyle([
    ("BACKGROUND",    (0,0), (-1, 0), C_HEADER),
    ("ROWBACKGROUNDS",(0,1), (-1,-1), [C_ROW1, C_ROW2]),
    ("GRID",          (0,0), (-1,-1), 0.25, C_LGRAY),
    ("VALIGN",        (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING",   (0,0), (-1,-1), 5),
    ("RIGHTPADDING",  (0,0), (-1,-1), 5),
    ("TOPPADDING",    (0,0), (-1,-1), 4),
    ("BOTTOMPADDING", (0,0), (-1,-1), 4),
]))
story.append(rrt)
story.append(PageBreak())

# ── 6. CANDIDATAS A ELIMINACIÓN ───────────────────────────────────────────────
story += section("6. Tablas Candidatas a Eliminacion o Revision")

story += section("6.1 Eliminacion directa recomendada (vacias + sin codigo)", 2)
story.append(p("Estas tablas no tienen datos, no tienen consumidores en el codigo, y pertenecen a modulos nunca implementados. Se pueden eliminar con DROP TABLE sin impacto en la aplicacion.", "body"))
story.append(sp(4))

drop_data = [
    [p("Grupo", "th"), p("Tablas a eliminar", "th"), p("Motivo", "th")],
    [p("Modulo de tiendas", "td"),
     p("shops · shop_inventory · locations", "small"),
     p("Modulo de tiendas nunca implementado. 0 filas. FK circular entre si.", "small")],
    [p("Thrusters/Propulsion", "td"),
     p("main_thrusters · manneuver_thrusters · ship_thrusters · thruster_stats", "small"),
     p("0 filas. Las propiedades relevantes estan en ship_flight_stats.", "small")],
    [p("Stats huerfanas", "td"),
     p("mining_stats · missile_stats · weapon_attachments · scanners · transponders", "small"),
     p("0 filas. Sin queries ni codigo asociado.", "small")],
    [p("Decoracion", "td"),
     p("paints", "small"),
     p("0 filas. Sin consumidor.", "small")],
]
drt = Table(drop_data, colWidths=[3.5*cm, 5.5*cm, PAGE_W - 2*MARGIN - 9*cm])
drt.setStyle(TableStyle([
    ("BACKGROUND",    (0,0), (-1, 0), C_HEADER),
    ("ROWBACKGROUNDS",(0,1), (-1,-1), [colors.HexColor("#FEF2F2"), colors.HexColor("#FFF7ED")]),
    ("GRID",          (0,0), (-1,-1), 0.25, C_LGRAY),
    ("VALIGN",        (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING",   (0,0), (-1,-1), 6),
    ("RIGHTPADDING",  (0,0), (-1,-1), 6),
    ("TOPPADDING",    (0,0), (-1,-1), 5),
    ("BOTTOMPADDING", (0,0), (-1,-1), 5),
]))
story.append(drt)
story.append(sp(10))

story += section("6.2 Revision recomendada (tienen datos, sin consumidor)", 2)
story.append(p("Estas tablas tienen datos importados desde sc-unpacked pero no hay endpoints que los sirvan. Antes de eliminarlas, decidir si se va a construir la feature.", "body"))
story.append(sp(4))

review_data = [
    ["Tabla", "Filas", "Accion sugerida"],
    ["turrets",              "270", "Crear endpoint en /api/catalog si se van a mostrar en loadout builder"],
    ["fuel_intakes",         "144", "Considerar para tab 'propulsion' en ShipSpecSheet"],
    ["fuel_tanks",           "165", "Idem"],
    ["quantum_fuel_tanks",   "136", "Idem"],
    ["missile_launchers",    "125", "Evaluar si se expone en ShipSpecSheet o se elimina"],
    ["armors",               "89",  "Evaluar si se expone en loadout builder"],
    ["radars",               "67",  "Evaluar exposicion en catalog/loadout"],
    ["quantum_interdiction_generators","6","Exponer o eliminar"],
    ["self_destruct_systems","7",  "Exponer o eliminar"],
    ["life_support_generators","13","Exponer o eliminar"],
    ["ship_insurance",       "293", "Exponer en ShipSpecSheet o eliminar"],
    ["ship_resistances",     "293", "Exponer en ShipSpecSheet o eliminar"],
    ["manufacturers",        "137", "Usar para enriquecer /api/ships con logos/datos del fabricante, o eliminar FK y tabla"],
    ["flight_controllers",   "209", "Verificar si /api/ships/[id] lo usa via flight_controllers tabla — no se detecto query directa"],
    ["flair_* (4 tablas)",   "~116","Exponer en un futuro modulo de hangar customization o eliminar"],
    ["weapon_defensives",    "148", "Evaluar si se expone en catalog"],
    ["emps",                 "7",   "Evaluar exposicion o eliminacion"],
    ["containers",           "22",  "Evaluar exposicion o eliminacion"],
    ["game_versions",        "1",   "Usar para mostrar version del juego en el footer o eliminar"],
]
rw_hdrs = review_data[0]
rw_rows = review_data[1:]
story.append(make_table(rw_hdrs, rw_rows,
    [4.5*cm, 1.5*cm, PAGE_W - 2*MARGIN - 6*cm]))
story.append(PageBreak())

# ── 7. RECOMENDACIONES ────────────────────────────────────────────────────────
story += section("7. Recomendaciones Accionables")

recs = [
    ("URGENTE", C_RED, "Aplicar migracion de referral_visits",
     """La tabla no existe en la DB. Aplicar con:
node -e "require('dotenv').config({path:'.env.local'}); const fs=require('fs'),pg=require('postgres'); const sql=pg(process.env.DATABASE_URL,{ssl:'require',prepare:false}); (async()=>{ await sql.unsafe(fs.readFileSync('prisma/migrations/20260410_streamers_referrals/migration.sql','utf8')); console.log('OK'); await sql.end(); })()"
"""),
    ("URGENTE", C_RED, "Eliminar doble fuente en Crafting",
     "useCraftingData.ts debe hacer fetch a /api/crafting/blueprints y /api/crafting/materials en lugar de importar JSON. Una vez migrado, eliminar src/data/crafting/blueprints.json y materials.json."),
    ("URGENTE", C_RED, "Eliminar doble fuente en ActivityManager",
     "ActivityManager.tsx debe consumir /api/activities/types y /api/activities/loot en lugar de importar los JSON directamente. Una vez migrado, eliminar los archivos JSON o dejarlos solo como fallback en la API (donde ya estan)."),
    ("IMPORTANTE", C_YELLOW, "Migrar modulo de mineria a la DB",
     "Los componentes RockCalculator, WorkOrderCalculator y RefineryDataTable deben usar la tabla mining_resources via un nuevo endpoint /api/mining/resources. Revisar si mining_resources tiene todos los campos que el JSON tiene (tier, basePrice, abbr) y completarlos si faltan."),
    ("IMPORTANTE", C_YELLOW, "Exponer tablas de componentes en /api/catalog",
     "Agregar turrets, radars, fuel_intakes, fuel_tanks, armors, missile_launchers a /api/components y /api/catalog para poder seleccionarlos en el loadout builder. Estas tablas tienen datos listos."),
    ("IMPORTANTE", C_YELLOW, "Exponer ship_insurance y ship_resistances en ShipSpecSheet",
     "Ambas tablas tienen 293 filas (una por nave). Agregar un JOIN en /api/ships/[id] y mostrar los datos en el spec sheet del ShipSpecSheet.tsx."),
    ("LIMPIEZA", C_GRAY, "Eliminar tablas de modulos nunca implementados",
     "Ejecutar DROP TABLE para: shops, shop_inventory, locations, main_thrusters, manneuver_thrusters, ship_thrusters, thruster_stats, mining_stats, missile_stats, weapon_attachments, scanners, transponders, paints. Crear una migracion nueva con estos drops para mantener el historial."),
    ("LIMPIEZA", C_GRAY, "Archivar data/trade-cache/",
     "Los JSON de trade-cache son snapshots de seed, no se importan en runtime. Moverlos a scripts/seed/ o documentarlos claramente para evitar confusion con fuentes activas."),
    ("LIMPIEZA", C_GRAY, "Activar price_history",
     "La tabla esta bien definida pero vacia. Si se quiere historial de precios CCU, el endpoint /api/ccu/prices al actualizar precios deberia insertar en price_history con el valor anterior."),
    ("LIMPIEZA", C_GRAY, "Resolver FK manufacturers",
     "Decidir: a) enriquecer con JOIN a manufacturers para tener logos/datos del fabricante, o b) eliminar la FK y la tabla si el campo TEXT denormalizado es suficiente."),
]

for prio, color, title, desc in recs:
    bg = colors.HexColor("#FEF2F2") if prio == "URGENTE" else (
         colors.HexColor("#FEFCE8") if prio == "IMPORTANTE" else C_ROW1)
    rec_data = [
        [Paragraph(f'<font color="#{color.hexval()[2:]}"><b>{prio}</b></font>',
                   ParagraphStyle("pr", fontSize=8, fontName="Helvetica-Bold", leading=10)),
         p(title, "h3")],
        ["", p(desc, "body")],
    ]
    rt2 = Table(rec_data, colWidths=[2.2*cm, PAGE_W - 2*MARGIN - 2.2*cm])
    rt2.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), bg),
        ("BOX",        (0,0), (-1,-1), 1, color),
        ("VALIGN",     (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING",(0,0), (-1,-1), 8),
        ("RIGHTPADDING",(0,0),(-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING",(0,0),(-1,-1), 6),
        ("SPAN",       (0,0), (0, 1)),
    ]))
    story.append(rt2)
    story.append(sp(6))

story.append(PageBreak())

# ── 8. EVIDENCIAS ─────────────────────────────────────────────────────────────
story += section("8. Anexo de Evidencias")

evidencias = [
    ("A — referral_visits ausente en DB",
     """Tabla NO aparece en information_schema.tables para schema public.
Migracion: prisma/migrations/20260410_streamers_referrals/migration.sql
Codigo: src/app/api/referral/track/route.ts
  INSERT INTO referral_visits (ref_code, landing_path, http_referer, user_agent, country, user_id)
  VALUES (${ref}, ${landingPath}, ${httpReferer}, ${userAgent}, ${country}, ${userId})"""),

    ("B — ActivityManager importa JSON ignorando la DB",
     """// src/app/activities/ActivityManager.tsx
import activityTypes from "@/data/activities/activity-types.json";
import lootItems    from "@/data/activities/loot-items.json";
// Las tablas activity_types (13 filas) y loot_items (132 filas) son ignoradas."""),

    ("C — API de actividades con fallback a JSON (correcto)",
     """// src/app/api/activities/types/route.ts
// 1. Intenta SELECT id, name, category, ... FROM activity_types ORDER BY category, name
// 2. Si falla, usa el JSON como fallback — correcto como safety-net.
// PROBLEMA: ActivityManager no pasa por la API, importa el JSON directamente."""),

    ("D — Modulo de mineria ignora mining_resources",
     """// src/app/mining/RockCalculator.tsx
// src/app/mining/WorkOrderCalculator.tsx
// src/app/mining/RefineryDataTable.tsx
import minerals from "@/data/mining/minerals.json";
// mining_resources en DB (69 filas) completamente ignorada.
// El endpoint /api/mining/lasers SI usa la tabla mining_lasers correctamente."""),

    ("E — ship_hardpoints referencia tipos sin endpoints propios",
     """Los hardpoints incluyen tipos: Radar, Countermeasure, ManneuverThruster, MainThruster,
Armor, FuelTank, FuelIntake, LifeSupportGenerator, TurretBase.
Las tablas para esos tipos EXISTEN con datos pero /api/ships/[id] solo hace
batch-fetch para: weapon_guns, shields, power_plants, coolers, quantum_drives."""),

    ("F — Tablas con datos completos sin ninguna query",
     """SELECT COUNT(*) FROM ship_insurance;   -- 293 filas — 0 queries en codigo
SELECT COUNT(*) FROM ship_resistances; -- 293 filas — 0 queries en codigo
SELECT COUNT(*) FROM turrets;          -- 270 filas — 0 queries en codigo
SELECT COUNT(*) FROM fuel_intakes;     -- 144 filas — 0 queries en codigo
SELECT COUNT(*) FROM missile_launchers;-- 125 filas — 0 queries en codigo"""),

    ("G — manufacturers nunca se consulta en runtime",
     """ships.manufacturer (TEXT) esta denormalizado: "Anvil Aerospace", "Origin Jumpworks", etc.
ships.manufacturer_id (INT) es FK a manufacturers.
Ninguna query en el codigo hace JOIN a manufacturers.
La tabla tiene 137 filas completamente ignoradas en runtime."""),
]

for title, code in evidencias:
    story.append(p(title, "h3"))
    story.append(p(code, "code"))
    story.append(sp(8))

# ── CIERRE ────────────────────────────────────────────────────────────────────
story.append(hr(C_BLUE, 1))
story.append(sp(6))
footer_text = (
    "Este informe fue generado el 11 de abril de 2026 mediante analisis estatico del "
    "codigo fuente en master, consulta directa a la base de datos Supabase PostgreSQL "
    "(aws-1-us-west-2, pooler 6543) y revision de las migraciones en prisma/migrations/. "
    "No se modifico ningun archivo de codigo ni de base de datos durante el proceso. "
    "Las estimaciones de filas provienen de pg_stat_user_tables.n_live_tup y pueden diferir "
    "minimamente del conteo exacto."
)
story.append(p(footer_text, "small"))

# ─── BUILD ────────────────────────────────────────────────────────────────────
doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    leftMargin=MARGIN,
    rightMargin=MARGIN,
    topMargin=1.5*cm,
    bottomMargin=1.5*cm,
    title="Auditoría Base de Datos Supabase — AL FILO Platform",
    author="SC Labs",
    subject="Database Audit Report",
    creator="AL FILO Platform audit tool",
)
doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
print(f"PDF generado en: {OUTPUT}")
