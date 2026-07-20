"""Tests de la importación bancaria: parseo, casado y cuadre."""

from decimal import Decimal

from app.services import importer as imp

CSV = (
    "Fecha;Concepto;Importe\n"
    "05/07/2026;PRESTAMO 3126089550;-69,69\n"
    "18/07/2026;COMPRA CARREFOUR;-52,30\n"
    "16/07/2026;NOMINA;1000,00\n"
)


def test_parse_formato_espanol():
    filas = imp.parse_file("extracto.csv", CSV.encode("utf-8"))
    assert len(filas) == 3
    assert filas[0].concepto == "PRESTAMO 3126089550"   # texto con dígitos, no importe
    assert filas[0].importe == Decimal("-69.69")


def test_match_y_cuadre(db):
    filas = imp.parse_file("extracto.csv", CSV.encode("utf-8"))
    # saldo_anterior arbitrario; saldo_real = anterior + suma
    suma = Decimal("-69.69") + Decimal("-52.30") + Decimal("1000")
    prev = imp.build_preview(db, filas, Decimal("1000"), Decimal("1000") + suma)
    # el -69.69 del 05/07 casa con la hipoteca existente
    hipo = next(f for f in prev.filas if f.importe == Decimal("-69.69"))
    assert hipo.reconocido is True
    assert hipo.categoria_sugerida == "Hipoteca + Seguro hogar"
    # el de Carrefour no se reconoce
    carr = next(f for f in prev.filas if f.importe == Decimal("-52.30"))
    assert carr.reconocido is False
    # la nómina de 1000 del 16/07 SÍ existe en los datos -> se casa sola
    nomina = next(f for f in prev.filas if f.importe == Decimal("1000"))
    assert nomina.reconocido is True
    assert prev.sin_categorizar == 1   # solo Carrefour
    assert prev.cuadra is True
    assert prev.diferencia == Decimal("0.00")


def test_dedup_no_disponible_en_servicio():
    # El dedup vive en el router /import/commit; aquí solo comprobamos el parseo idempotente
    a = imp.parse_file("e.csv", CSV.encode("utf-8"))
    b = imp.parse_file("e.csv", CSV.encode("utf-8"))
    assert [x.importe for x in a] == [x.importe for x in b]
