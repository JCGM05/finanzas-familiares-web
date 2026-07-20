from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.deps import get_db
from app.schemas import TransactionCreate, TransactionOut, TransactionUpdate

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _to_out(t: models.Transaction) -> TransactionOut:
    data = TransactionOut.model_validate(t)
    data.categoria_nombre = t.category.nombre if t.category else None
    return data


@router.get("", response_model=list[TransactionOut])
def list_transactions(
    anio: int | None = None,
    mes: int | None = None,
    category_id: int | None = None,
    pagado_con: models.PagadoCon | None = None,
    limit: int = 500,
    db: Session = Depends(get_db),
):
    q = db.query(models.Transaction)
    if anio is not None:
        q = q.filter(func.extract("year", models.Transaction.fecha) == anio)
    if mes is not None:
        q = q.filter(func.extract("month", models.Transaction.fecha) == mes)
    if category_id is not None:
        q = q.filter(models.Transaction.category_id == category_id)
    if pagado_con is not None:
        q = q.filter(models.Transaction.pagado_con == pagado_con)
    rows = q.order_by(models.Transaction.fecha.desc(), models.Transaction.id.desc()).limit(limit).all()
    return [_to_out(t) for t in rows]


@router.post("", response_model=TransactionOut, status_code=201)
def create_transaction(payload: TransactionCreate, db: Session = Depends(get_db)):
    if not db.get(models.Category, payload.category_id):
        raise HTTPException(422, "category_id no existe")
    t = models.Transaction(**payload.model_dump())
    db.add(t)
    db.commit()
    db.refresh(t)
    return _to_out(t)


@router.patch("/{transaction_id}", response_model=TransactionOut)
def update_transaction(transaction_id: int, payload: TransactionUpdate, db: Session = Depends(get_db)):
    t = db.get(models.Transaction, transaction_id)
    if not t:
        raise HTTPException(404, "Movimiento no encontrado")
    data = payload.model_dump(exclude_unset=True)
    if "category_id" in data and not db.get(models.Category, data["category_id"]):
        raise HTTPException(422, "category_id no existe")
    for field, value in data.items():
        setattr(t, field, value)
    db.commit()
    db.refresh(t)
    return _to_out(t)


@router.delete("/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    t = db.get(models.Transaction, transaction_id)
    if not t:
        raise HTTPException(404, "Movimiento no encontrado")
    db.delete(t)
    db.commit()
