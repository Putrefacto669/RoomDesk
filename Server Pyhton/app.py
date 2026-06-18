from flask import Flask, request, send_file, jsonify, after_this_request, make_response
from flask_cors import CORS 
import os
import io
import uuid
import logging
import tempfile
from datetime import datetime

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Image, HRFlowable
)

# ─── Configuración básica ────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("roomdesk")

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

DEBUG = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
VALID_REPORT_TYPES = {"reservations", "occupancy", "guests", "revenue", "consumptions"}

# Etiquetas en español para mostrar en el PDF, según el status que guarda Supabase
STATUS_LABELS = {
    "pending": "Pendiente",
    "confirmed": "Confirmada",
    "cancelled": "Cancelada",
}

def status_label(raw_status: str) -> str:
    """Traduce el status interno (pending/confirmed/cancelled) a una etiqueta en español para el PDF."""
    key = str(raw_status or "").strip().lower()
    return STATUS_LABELS.get(key, raw_status or "Pendiente")

# ─── Paleta de colores y estilos ─────────────────────────────────────────────

PRIMARY      = colors.HexColor("#1E2A5E")   
ACCENT       = colors.HexColor("#E84560")   
SUCCESS      = colors.HexColor("#27AE60")   
WARNING      = colors.HexColor("#F39C12")   
INFO         = colors.HexColor("#2980B9")   
LIGHT_BG     = colors.HexColor("#F4F6FB")   
ROW_ALT      = colors.HexColor("#EDF0F8")   
TEXT_DARK    = colors.HexColor("#2C3E50")
TEXT_MID     = colors.HexColor("#5D6D7E")
TEXT_LIGHT   = colors.HexColor("#95A5A6")
DIVIDER      = colors.HexColor("#D5DCF0")
WHITE        = colors.white

CHART_PALETTE = ["#E84560", "#1E2A5E", "#27AE60", "#F39C12", "#8E44AD",
                 "#2980B9", "#E67E22", "#1ABC9C", "#C0392B", "#7F8C8D"]

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm

def build_styles():
    return {
        "title": ParagraphStyle("ReportTitle", fontName="Helvetica-Bold", fontSize=22, textColor=WHITE, alignment=TA_LEFT, spaceAfter=2),
        "subtitle": ParagraphStyle("ReportSubtitle", fontName="Helvetica", fontSize=11, textColor=colors.HexColor("#B0BAD4"), alignment=TA_LEFT, spaceAfter=0),
        "section": ParagraphStyle("Section", fontName="Helvetica-Bold", fontSize=13, textColor=PRIMARY, spaceBefore=14, spaceAfter=6),
        "body": ParagraphStyle("Body", fontName="Helvetica", fontSize=10, textColor=TEXT_DARK, leading=15, spaceAfter=4),
        "caption": ParagraphStyle("Caption", fontName="Helvetica-Oblique", fontSize=8, textColor=TEXT_LIGHT, alignment=TA_CENTER, spaceAfter=6),
        "kpi_value": ParagraphStyle("KpiValue", fontName="Helvetica-Bold", fontSize=20, textColor=PRIMARY, alignment=TA_CENTER, spaceAfter=2),
        "kpi_label": ParagraphStyle("KpiLabel", fontName="Helvetica", fontSize=9, textColor=TEXT_MID, alignment=TA_CENTER, spaceAfter=0),
        "footer": ParagraphStyle("Footer", fontName="Helvetica-Oblique", fontSize=8, textColor=TEXT_LIGHT, alignment=TA_CENTER),
    }

# ─── Plantilla de página ─────────────────────────────────────────────────────

class RoomDeskTemplate:
    HEADER_H = 52 * mm

    def __init__(self, report_type: str, fecha_inicio: str, fecha_fin: str):
        self.report_type = report_type
        self.fecha_inicio = fecha_inicio
        self.fecha_fin    = fecha_fin
        self.titles = {
            "reservations": "Reporte de Reservaciones",
            "occupancy":    "Análisis de Ocupación",
            "guests":       "Directorio de Huéspedes",
            "revenue":      "Reporte Financiero de Ingresos",
            "consumptions": "Registro de Consumos",
        }

    def on_page(self, canvas, doc):
        canvas.saveState()
        self._draw_header(canvas, doc)
        self._draw_footer(canvas, doc)
        canvas.restoreState()

    def _draw_header(self, canvas, doc):
        w, h = A4
        canvas.setFillColor(PRIMARY)
        canvas.rect(0, h - self.HEADER_H, w, self.HEADER_H, fill=1, stroke=0)

        canvas.setFillColor(ACCENT)
        canvas.rect(0, h - self.HEADER_H, w, 3, fill=1, stroke=0)

        canvas.setFillColor(colors.HexColor("#2E3F7F"))
        canvas.circle(w - 25 * mm, h - 10 * mm, 28 * mm, fill=1, stroke=0)
        canvas.setFillColor(colors.HexColor("#3A4F8F"))
        canvas.circle(w - 10 * mm, h - 32 * mm, 18 * mm, fill=1, stroke=0)

        canvas.setFont("Helvetica-Bold", 26)
        canvas.setFillColor(WHITE)
        canvas.drawString(MARGIN, h - 22 * mm, "ROOMDESK")

        canvas.setFont("Helvetica", 10)
        canvas.setFillColor(colors.HexColor("#A8B8D8"))
        canvas.drawString(MARGIN, h - 30 * mm, "Plataforma de Gestión Hotelera")

        canvas.setStrokeColor(colors.HexColor("#3A4F8F"))
        canvas.setLineWidth(1.5)
        canvas.line(MARGIN, h - 36 * mm, MARGIN + 110 * mm, h - 36 * mm)

        title = self.titles.get(self.report_type, "Reporte General")
        canvas.setFont("Helvetica-Bold", 14)
        canvas.setFillColor(WHITE)
        canvas.drawString(MARGIN, h - 44 * mm, title)

        canvas.setFont("Helvetica", 9)
        canvas.setFillColor(colors.HexColor("#A8B8D8"))
        date_str = datetime.now().strftime("%d %b %Y, %H:%M")
        canvas.drawRightString(w - MARGIN, h - 18 * mm, f"Generado: {date_str}")
        if self.fecha_inicio and self.fecha_fin:
            canvas.drawRightString(w - MARGIN, h - 25 * mm, f"Período: {self.fecha_inicio} – {self.fecha_fin}")

        canvas.setFont("Helvetica-Bold", 9)
        canvas.setFillColor(colors.HexColor("#A8B8D8"))
        canvas.drawRightString(w - MARGIN, h - 42 * mm, f"Página {doc.page}")

    def _draw_footer(self, canvas, doc):
        w, h = A4
        canvas.setStrokeColor(DIVIDER)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, 16 * mm, w - MARGIN, 16 * mm)
        canvas.setFont("Helvetica-Oblique", 8)
        canvas.setFillColor(TEXT_LIGHT)
        canvas.drawString(MARGIN, 10 * mm, "RoomDesk © 2026 — Documento confidencial generado automáticamente.")
        canvas.drawRightString(w - MARGIN, 10 * mm, "www.roomdesk.app")

# ─── Generador principal ──────────────────────────────────────────────────────

class PDFGenerator:
    def __init__(self):
        self.styles = build_styles()
        self.current_run_charts = [] # Rastreador de archivos de imagen por ejecución

    def _save_chart(self, fig) -> str:
        tmp_dir = tempfile.gettempdir()
        path = os.path.join(tmp_dir, f"chart_{uuid.uuid4().hex}.png")
        fig.savefig(path, dpi=140, bbox_inches="tight", facecolor="white", edgecolor="none")
        plt.close(fig)
        self.current_run_charts.append(path) # Lo agendamos para borrar después del build
        return path

    def chart_donut(self, distribution: dict) -> str:
        labels = [k for k, v in distribution.items() if v > 0]
        values = [v for v in distribution.values() if v > 0]

        if not values:
            return self._empty_chart("Sin datos de ocupación")

        fig, ax = plt.subplots(figsize=(7, 4.5))
        fig.patch.set_facecolor("white")

        palette = [CHART_PALETTE[i % len(CHART_PALETTE)] for i in range(len(labels))]
        wedges, texts, autotexts = ax.pie(
            values, labels=None, colors=palette, autopct="%1.1f%%", startangle=90,
            wedgeprops=dict(width=0.5, edgecolor="white", linewidth=2), pctdistance=0.75,
        )
        for at in autotexts:
            at.set_fontsize(10)
            at.set_fontweight("bold")
            at.set_color("white")

        total = sum(values)
        ax.text(0, 0.05, str(total), ha="center", va="center", fontsize=22, fontweight="bold", color="#1E2A5E")
        ax.text(0, -0.18, "Total", ha="center", va="center", fontsize=10, color="#5D6D7E")

        legend_patches = [mpatches.Patch(color=palette[i], label=f"{labels[i]}: {values[i]}") for i in range(len(labels))]
        ax.legend(handles=legend_patches, loc="center left", bbox_to_anchor=(1.05, 0.5), fontsize=10, frameon=False)

        ax.set_title("Distribución de Habitaciones", fontsize=13, fontweight="bold", color="#1E2A5E", pad=18)
        plt.tight_layout()
        return self._save_chart(fig)

    def chart_bars(self, data: list, x_key: str, y_key: str, title: str, y_label: str = "", color_idx: int = 0) -> str:
        if not data:
            return self._empty_chart("Sin datos")

        labels = [str(d.get(x_key, ""))[:18] for d in data]
        values = [float(d.get(y_key, 0)) for d in data]

        fig, ax = plt.subplots(figsize=(8, 4))
        fig.patch.set_facecolor("white")
        ax.set_facecolor("#F9FAFC")

        bar_color = CHART_PALETTE[color_idx % len(CHART_PALETTE)]
        bars = ax.bar(labels, values, color=bar_color, alpha=0.88, edgecolor="white", linewidth=1.5, width=0.55)

        max_v = max(values) if values else 1
        for bar in bars:
            h = bar.get_height()
            label = f"Q{h:,.0f}" if "monto" in y_key.lower() else f"{h:,.0f}"
            ax.text(bar.get_x() + bar.get_width() / 2, h + max_v * 0.018, label, ha="center", va="bottom", fontsize=8.5, color="#2C3E50", fontweight="bold")

        ax.set_title(title, fontsize=13, fontweight="bold", color="#1E2A5E", pad=14)
        if y_label:
            ax.set_ylabel(y_label, fontsize=9, color="#5D6D7E")
        ax.set_ylim(0, max_v * 1.18)
        ax.tick_params(axis="x", rotation=30, labelsize=9, colors="#5D6D7E")
        ax.tick_params(axis="y", labelsize=9, colors="#5D6D7E")
        ax.yaxis.grid(True, linestyle="--", alpha=0.5, color="#D5DCF0")
        ax.set_axisbelow(True)
        for spine in ["top", "right", "left"]:
            ax.spines[spine].set_visible(False)
        ax.spines["bottom"].set_color("#D5DCF0")

        plt.tight_layout()
        return self._save_chart(fig)

    def chart_horizontal_bars(self, data: list, label_key: str, value_key: str, title: str) -> str:
        if not data:
            return self._empty_chart("Sin datos")

        labels = [str(d.get(label_key, ""))[:22] for d in data[:10]]
        values = [float(d.get(value_key, 1)) for d in data[:10]]

        fig, ax = plt.subplots(figsize=(8, max(3.5, len(labels) * 0.55)))
        fig.patch.set_facecolor("white")
        ax.set_facecolor("#F9FAFC")

        y_pos = np.arange(len(labels))
        bars = ax.barh(y_pos, values, color=[CHART_PALETTE[i % len(CHART_PALETTE)] for i in range(len(labels))], alpha=0.85, edgecolor="white", linewidth=1.2, height=0.6)

        ax.set_yticks(y_pos)
        ax.set_yticklabels(labels, fontsize=9.5, color="#2C3E50")
        ax.set_title(title, fontsize=13, fontweight="bold", color="#1E2A5E", pad=14)
        ax.xaxis.grid(True, linestyle="--", alpha=0.4, color="#D5DCF0")
        ax.set_axisbelow(True)
        for spine in ["top", "right", "bottom"]:
            ax.spines[spine].set_visible(False)
        ax.spines["left"].set_color("#D5DCF0")
        ax.tick_params(axis="x", labelsize=8, colors="#5D6D7E")
        ax.invert_yaxis()

        plt.tight_layout()
        return self._save_chart(fig)

    def _empty_chart(self, message: str) -> str:
        fig, ax = plt.subplots(figsize=(7, 3))
        fig.patch.set_facecolor("white")
        ax.text(0.5, 0.5, message, ha="center", va="center", fontsize=13, color="#95A5A6", transform=ax.transAxes)
        ax.axis("off")
        return self._save_chart(fig)

    def _kpi_table(self, kpis: list) -> Table:
        n = len(kpis)
        col_w = (PAGE_W - 2 * MARGIN) / n

        header_row, value_row, label_row = [], [], []
        for kpi in kpis:
            header_row.append("")
            value_row.append(Paragraph(str(kpi["value"]), self.styles["kpi_value"]))
            label_row.append(Paragraph(kpi["label"], self.styles["kpi_label"]))

        data = [header_row, value_row, label_row]
        style = [
            ("BACKGROUND",    (0, 1), (-1, -1), LIGHT_BG),
            ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",    (0, 0), (-1, 0),  4),
            ("BOTTOMPADDING", (0, 0), (-1, 0),  4),
            ("TOPPADDING",    (0, 1), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 2), (-1, -1), 12),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
            ("LINEAFTER",     (0, 0), (-2, -1), 1, WHITE),
            ("BOX",           (0, 0), (-1, -1), 1, DIVIDER),
        ]
        for i, kpi in enumerate(kpis):
            style.append(("BACKGROUND", (i, 0), (i, 0), kpi.get("color", PRIMARY)))

        t = Table(data, colWidths=[col_w] * n)
        t.setStyle(TableStyle(style))
        return t

    def _data_table(self, data: list, col_widths=None) -> Table:
        if not data:
            return Paragraph("No hay registros para mostrar.", self.styles["caption"])

        headers = list(data[0].keys())
        n_cols  = len(headers)
        avail_w = PAGE_W - 2 * MARGIN
        if col_widths is None: col_widths = [avail_w / n_cols] * n_cols

        header_row = [Paragraph(str(h).replace("_", " ").title(), ParagraphStyle("th", fontName="Helvetica-Bold", fontSize=9, textColor=WHITE, alignment=TA_CENTER)) for h in headers]
        rows = [header_row]
        for row in data:
            cells = []
            for key in headers:
                value = row.get(key, "—")
                # Si la columna es de estado, mostramos la etiqueta traducida en vez del valor crudo (pending/confirmed/cancelled)
                if key == "status":
                    value = status_label(value)
                cells.append(Paragraph(str(value), ParagraphStyle("td", fontName="Helvetica", fontSize=8.5, textColor=TEXT_DARK, alignment=TA_CENTER, leading=12)))
            rows.append(cells)

        table = Table(rows, colWidths=col_widths, repeatRows=1)
        style = [
            ("BACKGROUND",    (0, 0), (-1, 0),  PRIMARY),
            ("TOPPADDING",    (0, 0), (-1, 0),  8),
            ("BOTTOMPADDING", (0, 0), (-1, 0),  8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, ROW_ALT]),
            ("TOPPADDING",    (0, 1), (-1, -1),  6),
            ("BOTTOMPADDING", (0, 1), (-1, -1),  6),
            ("LEFTPADDING",   (0, 0), (-1, -1),  8),
            ("RIGHTPADDING",  (0, 0), (-1, -1),  8),
            ("GRID",          (0, 0), (-1, -1),  0.4, DIVIDER),
            ("LINEBELOW",     (0, 0), (-1, 0),   1.5, ACCENT),
            ("VALIGN",        (0, 0), (-1, -1),  "MIDDLE"),
        ]
        table.setStyle(TableStyle(style))
        return table

    def _section_header(self, text: str) -> list:
        return [Spacer(1, 6 * mm), Paragraph(text, self.styles["section"]), HRFlowable(width="100%", thickness=1.5, color=ACCENT, spaceAfter=4 * mm)]

    def _chart_image(self, path: str, width_mm: float = 155) -> Image:
        img = Image(path, width=width_mm * mm, height=width_mm * mm * 0.55)
        img.hAlign = "CENTER"
        return img

    def _build_reservations(self, data: list) -> list:
        story = []
        total = len(data)
        # Reconoce los valores reales que guarda Supabase (pending/confirmed/cancelled)
        # y también variantes en español por si se reciben de otra fuente.
        pendientes = sum(1 for d in data if str(d.get("status", "")).strip().lower() in ("pendiente", "pending", ""))
        confirmadas = sum(1 for d in data if str(d.get("status", "")).strip().lower() in ("confirmada", "confirmed", "activa", "active"))
        canceladas  = sum(1 for d in data if str(d.get("status", "")).strip().lower() in ("cancelada", "cancelled", "canceled"))

        kpis = [
            {"value": total,       "label": "Total Reservas",    "color": PRIMARY},
            {"value": confirmadas, "label": "Confirmadas",        "color": SUCCESS},
            {"value": pendientes,  "label": "Pendientes",         "color": WARNING},
            {"value": canceladas,  "label": "Canceladas",         "color": ACCENT},
        ]
        story += self._section_header("Resumen Ejecutivo")
        story.append(self._kpi_table(kpis))
        story.append(Spacer(1, 6 * mm))

        if data and any("status" in d for d in data):
            status_count = {}
            for d in data:
                s = status_label(d.get("status", ""))
                status_count[s] = status_count.get(s, 0) + 1
            chart_data = [{"estado": k, "cantidad": v} for k, v in status_count.items()]
            chart_path = self.chart_bars(chart_data, "estado", "cantidad", "Reservas por Estado", "Cantidad")
            story += self._section_header("Distribución por Estado")
            story.append(self._chart_image(chart_path))

        story += self._section_header("Detalle de Reservaciones")
        story.append(self._data_table(data))
        return story

    def _build_occupancy(self, data: list) -> list:
        story = []
        disponibles   = sum(1 for d in data if str(d.get("status", "")).lower() in ("disponible", "libre"))
        ocupadas      = sum(1 for d in data if str(d.get("status", "")).lower() in ("ocupada", "occupied"))
        mantenimiento = sum(1 for d in data if str(d.get("status", "")).lower() in ("mantenimiento", "maintenance"))
        total         = len(data)

        kpis = [
            {"value": total,          "label": "Total Habitaciones", "color": PRIMARY},
            {"value": ocupadas,       "label": "Ocupadas",            "color": ACCENT},
            {"value": disponibles,    "label": "Disponibles",         "color": SUCCESS},
            {"value": mantenimiento,  "label": "Mantenimiento",       "color": WARNING},
        ]
        story += self._section_header("Resumen de Ocupación")
        story.append(self._kpi_table(kpis))
        story.append(Spacer(1, 5 * mm))

        dist = {"Disponible": disponibles, "Ocupada": ocupadas, "Mantenimiento": mantenimiento}
        chart_path = self.chart_donut(dist)
        story += self._section_header("Distribución Visual")
        story.append(self._chart_image(chart_path, width_mm=140))

        story += self._section_header("Estado por Habitación")
        story.append(self._data_table(data))
        return story

    def _build_guests(self, data: list) -> list:
        story = []
        total = len(data)
        kpis = [{"value": total, "label": "Total Huéspedes Registrados", "color": PRIMARY}]
        story += self._section_header("Resumen de Huéspedes")
        story.append(self._kpi_table(kpis))
        story.append(Spacer(1, 6 * mm))

        if data and len(data) >= 2:
            name_key = next((k for k in data[0] if "name" in k.lower() or "nombre" in k.lower()), None)
            count_key = next((k for k in data[0] if "count" in k.lower() or "visitas" in k.lower()), None)
            if name_key and count_key:
                chart_path = self.chart_horizontal_bars(data, name_key, count_key, "Huéspedes por Visitas")
                story += self._section_header("Ranking de Huéspedes")
                story.append(self._chart_image(chart_path))

        story += self._section_header("Directorio Completo")
        story.append(self._data_table(data))
        return story

    def _build_revenue(self, data: list) -> list:
        story = []
        monto_key = next((k for k in (data[0].keys() if data else []) if "monto" in k.lower() or "amount" in k.lower()), "monto")
        name_key = next((k for k in (data[0].keys() if data else []) if "name" in k.lower() or "concepto" in k.lower()), "name")

        total     = sum(float(d.get(monto_key, 0)) for d in data)
        promedio  = total / len(data) if data else 0
        max_ingr  = max((float(d.get(monto_key, 0)) for d in data), default=0)

        kpis = [
            {"value": f"Q{total:,.2f}",   "label": "Ingresos Totales",  "color": SUCCESS},
            {"value": f"Q{promedio:,.2f}", "label": "Promedio por Ítem", "color": INFO},
            {"value": f"Q{max_ingr:,.2f}", "label": "Mayor Ingreso",     "color": PRIMARY},
            {"value": len(data),           "label": "Transacciones",     "color": WARNING},
        ]
        story += self._section_header("Resumen Financiero")
        story.append(self._kpi_table(kpis))
        story.append(Spacer(1, 6 * mm))

        chart_path = self.chart_bars(data[:15], name_key, monto_key, "Ingresos por Concepto", "Monto (Q)", color_idx=3)
        story += self._section_header("Distribución de Ingresos")
        story.append(self._chart_image(chart_path))

        story += self._section_header("Detalle de Transacciones")
        story.append(self._data_table(data))
        return story

    def _build_consumptions(self, data: list) -> list:
        story = []
        total = len(data)
        monto_key = next((k for k in (data[0].keys() if data else []) if "monto" in k.lower() or "price" in k.lower()), None)
        total_consumido = sum(float(d.get(monto_key, 0)) for d in data) if monto_key else 0

        kpis = [
            {"value": total, "label": "Total Consumos", "color": PRIMARY},
            {"value": f"Q{total_consumido:,.2f}" if monto_key else "—", "label": "Monto Total Consumido", "color": ACCENT},
        ]
        story += self._section_header("Resumen de Consumos")
        story.append(self._kpi_table(kpis))
        story.append(Spacer(1, 6 * mm))

        item_key = next((k for k in (data[0].keys() if data else []) if "item" in k.lower() or "producto" in k.lower()), None)
        if item_key and monto_key and data:
            chart_path = self.chart_bars(data[:12], item_key, monto_key, "Consumos por Producto/Servicio", "Monto (Q)", color_idx=4)
            story += self._section_header("Consumos por Producto")
            story.append(self._chart_image(chart_path))

        story += self._section_header("Registro Completo de Consumos")
        story.append(self._data_table(data))
        return story

    def _cleanup(self, *paths):
        for p in paths:
            try:
                if p and os.path.exists(p):
                    os.remove(p)
            except Exception as e:
                log.warning("No se pudo eliminar %s: %s", p, e)

    def generate(self, report_type: str, data: list, fecha_inicio: str, fecha_fin: str) -> str:
        self.current_run_charts = [] # Reset de la lista para esta ejecución
        
        tmp_dir = tempfile.gettempdir()
        pdf_path = os.path.join(tmp_dir, f"reporte_{uuid.uuid4().hex}.pdf")
        
        template = RoomDeskTemplate(report_type, fecha_inicio, fecha_fin)

        doc = SimpleDocTemplate(
            pdf_path, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
            topMargin=RoomDeskTemplate.HEADER_H + 8 * mm, bottomMargin=24 * mm,
            title=f"RoomDesk – {report_type.capitalize()}", author="RoomDesk Platform",
        )

        builders = {
            "reservations": self._build_reservations,
            "occupancy":    self._build_occupancy,
            "guests":       self._build_guests,
            "revenue":      self._build_revenue,
            "consumptions": self._build_consumptions,
        }
        builder = builders.get(report_type, self._build_reservations)
        story   = builder(data)

        # 1. Construimos el documento en base a la "story" (Aquí ReportLab sí leerá las imágenes)
        doc.build(story, onFirstPage=template.on_page, onLaterPages=template.on_page)
        
        # 2. AHORA SÍ es seguro borrar las imágenes generadas, una vez compilado el PDF
        self._cleanup(*self.current_run_charts)
        
        log.info("PDF generado exitosamente: %s (%s registros)", report_type, len(data))
        return pdf_path

generator = PDFGenerator()

@app.route("/api/generate-pdf", methods=["POST", "OPTIONS"])
def generate_pdf():
    if request.method == "OPTIONS":
        return make_response(jsonify({"status": "ok"}), 200)

    pdf_path = None
    try:
        payload = request.get_json(silent=True)
        if not payload:
            return jsonify({"error": "Payload JSON inválido o vacío."}), 400

        report_type = payload.get("report_type", "").strip()
        if report_type not in VALID_REPORT_TYPES:
            return jsonify({"error": f"Tipo de reporte inválido. Usa uno de: {sorted(VALID_REPORT_TYPES)}"}), 400

        data = payload.get("data", [])
        if not isinstance(data, list):
            return jsonify({"error": "El campo 'data' debe ser una lista JSON."}), 400

        fecha_inicio = str(payload.get("fecha_inicio", "")).strip()
        fecha_fin    = str(payload.get("fecha_fin",    "")).strip()

        log.info("Generando reporte '%s' con %d registros.", report_type, len(data))
        pdf_path = generator.generate(report_type, data, fecha_inicio, fecha_fin)

        @after_this_request
        def remove_file(response):
            if pdf_path and os.path.exists(pdf_path):
                try:
                    os.remove(pdf_path)
                except Exception as e:
                    log.warning("No se pudo eliminar el PDF temporal: %s", e)
            return response

        return send_file(
            pdf_path,
            as_attachment=True,
            download_name=f"roomdesk_{report_type}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf",
            mimetype="application/pdf",
        )

    except Exception as exc:
        log.exception("Error al generar el PDF.")
        if pdf_path:
            generator._cleanup(pdf_path)
        return jsonify({"error": "Error interno al generar el PDF.", "detalle": str(exc)}), 500

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "version": "2.0.0", "service": "RoomDesk PDF Server"})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=False, host="0.0.0.0", port=port)
