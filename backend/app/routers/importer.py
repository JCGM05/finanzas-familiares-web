from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app import models
from app.deps import get_db
from app.schemas import (
    ImportCommitRequest,
    ImportCommitResponse,
    ImportPreviewRequest,
    ImportPreviewResponse,
    ImportRowIn,
)
from app.services import importer as svc

router = APIRouter(prefix="/import", tags=["import"])


@router.post("/parse", response_model=list[ImportRowIn])
async def parse_extracto(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Sube el extracto del banco (.xlsx o .csv) y devuelve las filas parseadas."""
    content = await file.read()
    try:
        return svc.parse_file(file.filename or "extracto", content)
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.post("/preview", response_model=ImportPreviewResponse)
def preview(payload: ImportPreviewRequest, db: Session = Depends(get_db)):
    """Casa las filas contra Movimientos, autocategoriza y cuadra saldos."""
    return svc.build_preview(db, payload.filas, payload.saldo_anterior, payload.saldo_real_banco)


@router.post("/commit", response_model=ImportCommitResponse)
def commit(payload: ImportCommitRequest, db: Session = Depends(get_db)):
    """Inserta en Movimientos las filas confirmadas (importe siempre positivo).
    Salta las que ya existan (misma fecha, importe y descripción) para no duplicar
    al reimportar un extracto."""
    insertados = 0
    saltados = 0
    for row in payload.filas:
        if not db.get(models.Category, row.category_id):
            raise HTTPException(422, f"category_id {row.category_id} no existe")
        importe = abs(row.importe)
        ya_existe = (
            db.query(models.Transaction)
            .filter(
                models.Transaction.fecha == row.fecha,
                models.Transaction.importe == importe,
                models.Transaction.descripcion == row.descripcion,
            )
            .first()
        )
        if ya_existe:
            saltados += 1
            continue
        db.add(
            models.Transaction(
                fecha=row.fecha,
                tipo=row.tipo,
                category_id=row.category_id,
                descripcion=row.descripcion,
                importe=importe,
                pagado_con=row.pagado_con,
            )
        )
        insertados += 1
    db.commit()
    return ImportCommitResponse(insertados=insertados, duplicados_saltados=saltados)
