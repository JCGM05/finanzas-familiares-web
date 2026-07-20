"""
Importación bancaria: parsear el extracto, casar contra los movimientos
existentes (autocompletar categoría/tipo), cuadrar saldos y avisar de mes
duplicado. Réplica de la hoja IMPORTAR del Excel.
"""

import csv
import io
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.schemas import (
    ImportMonthCheck,
    ImportPreviewResponse,
    ImportRowIn,
    ImportRowPreview,
)

Z = Decimal("0")
MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]


def _parse_amount(raw) -> Decimal | None:
    """Acepta '1.234,56', '-40,00', '1234.56', números... formato español."""
    if raw is None or raw == "":
        return None
    if isinstance(raw, (int, float, Decimal)):
        return Decimal(str(raw))
    s = str(raw).strip().replace("€", "").replace(" ", "")
    if not s:
        return None
    # Si tiene coma decimal española: quitar puntos de miles y coma -> punto
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def _parse_date(raw) -> date | None:
    if raw is None or raw == "":
        return None
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw
    s = str(raw).strip()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y", "%d.%m.%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def parse_file(filename: str, content: bytes) -> list[ImportRowIn]:
    """
    Parsea un extracto .xlsx o .csv de forma tolerante: por cada fila busca
    una fecha, un importe (con signo) y usa el resto como concepto.
    Se asume el orden habitual Fecha · Concepto · Importe, pero se detecta
    la fecha y el número aunque estén en otras columnas.
    """
    name = filename.lower()
    rows: list[list] = []

    if name.endswith(".csv") or name.endswith(".txt"):
        text = content.decode("utf-8-sig", errors="replace")
        # Detectar delimitador (; habitual en bancos españoles)
        sample = text[:2048]
        delim = ";" if sample.count(";") >= sample.count(",") else ","
        for r in csv.reader(io.StringIO(text), delimiter=delim):
            rows.append(list(r))
    elif name.endswith(".xlsx") or name.endswith(".xls"):
        import openpyxl

        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True, read_only=True)
        ws = wb.active
        for r in ws.iter_rows(values_only=True):
            rows.append(list(r))
    else:
        raise ValueError("Formato no soportado. Usa .xlsx o .csv")

    parsed: list[ImportRowIn] = []
    for r in rows:
        if not r:
            continue
        fecha: date | None = None
        importe: Decimal | None = None
        textos: list[str] = []
        for cell in r:
            # 1) celdas-fecha: la primera es la fecha; las siguientes (p. ej.
            #    'Fecha valor') se ignoran para no ensuciar el concepto
            if _parse_date(cell) is not None:
                if fecha is None:
                    fecha = _parse_date(cell)
                continue
            # 2) primer número (con signo) = importe; números posteriores (p. ej.
            #    columna de saldo o nº de apunte) se ignoran
            amt = _parse_amount(cell)
            if amt is not None:
                if importe is None:
                    importe = amt
                continue
            # 3) el resto es texto del concepto
            if cell is not None and str(cell).strip():
                textos.append(str(cell).strip())
        if fecha is not None and importe is not None:
            concepto = " · ".join(textos)[:200] or "(sin concepto)"
            parsed.append(ImportRowIn(fecha=fecha, concepto=concepto, importe=importe))
    return parsed


def _match_existente(db: Session, row: ImportRowIn):
    """Busca un movimiento de la CUENTA COMÚN (banco) con misma fecha e importe.
    Los movimientos en efectivo se ignoran: no están en el extracto del banco."""
    return (
        db.query(models.Transaction)
        .filter(
            models.Transaction.fecha == row.fecha,
            models.Transaction.importe == abs(row.importe),
            models.Transaction.pagado_con == models.PagadoCon.CUENTA_COMUN,
        )
        .order_by(models.Transaction.id.desc())
        .first()
    )


def build_preview(
    db: Session,
    filas: list[ImportRowIn],
    saldo_anterior: Decimal,
    saldo_real_banco: Decimal | None,
) -> ImportPreviewResponse:
    previews: list[ImportRowPreview] = []
    sin_categorizar = 0

    for row in filas:
        match = _match_existente(db, row)
        if match is not None:
            tipo = match.tipo
            cat_id = match.category_id
            cat_nombre = match.category.nombre if match.category else None
            reconocido = True
        else:
            tipo = (
                models.TipoMovimiento.GASTO
                if row.importe < 0
                else models.TipoMovimiento.INGRESO_EXTRA
            )
            cat_id = None
            cat_nombre = None
            reconocido = False
            sin_categorizar += 1
        previews.append(
            ImportRowPreview(
                fecha=row.fecha,
                concepto=row.concepto,
                importe=row.importe,
                tipo_sugerido=tipo,
                category_id_sugerida=cat_id,
                categoria_sugerida=cat_nombre,
                reconocido=reconocido,
            )
        )

    suma = sum((r.importe for r in filas), Z)
    deberia = saldo_anterior + suma
    diferencia = (saldo_real_banco - deberia) if saldo_real_banco is not None else None
    cuadra = (abs(diferencia) < Decimal("0.01")) if diferencia is not None else None

    # Comprobación de mes: usa el mes/año del apunte más reciente pegado
    if filas:
        fmax = max(r.fecha for r in filas)
        mes, anio = fmax.month, fmax.year
        # Solo cuentan los movimientos de la cuenta común (banco); el efectivo no.
        ya = (
            db.query(func.count(models.Transaction.id))
            .filter(
                func.extract("year", models.Transaction.fecha) == anio,
                func.extract("month", models.Transaction.fecha) == mes,
                models.Transaction.pagado_con == models.PagadoCon.CUENTA_COMUN,
            )
            .scalar()
        )
        es_nuevo = ya == 0
        if es_nuevo:
            aviso = f"✓ Mes nuevo: no hay movimientos previos de {MESES[mes - 1]} {anio}."
        else:
            aviso = (
                f"⚠ Los movimientos del banco son de {MESES[mes - 1]} {anio}, "
                f"que YA tiene {ya} movimientos registrados. Revisa que no dupliques."
            )
        check = ImportMonthCheck(mes=mes, anio=anio, ya_registrados=ya, es_mes_nuevo=es_nuevo, aviso=aviso)
    else:
        check = ImportMonthCheck(mes=None, anio=None, ya_registrados=0, es_mes_nuevo=True, aviso="Sin filas.")

    return ImportPreviewResponse(
        filas=previews,
        movimientos_pegados=len(filas),
        suma_extracto=suma,
        sin_categorizar=sin_categorizar,
        saldo_anterior=saldo_anterior,
        saldo_deberia_quedar=deberia,
        saldo_real_banco=saldo_real_banco,
        diferencia=diferencia,
        cuadra=cuadra,
        comprobacion_mes=check,
    )
