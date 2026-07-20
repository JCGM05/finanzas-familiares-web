from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.deps import get_db
from app.schemas import NetWorthEntryOut, NetWorthEntryUpsert, NetWorthItemOut

router = APIRouter(prefix="/networth", tags=["networth"])


@router.get("/items", response_model=list[NetWorthItemOut])
def list_items(db: Session = Depends(get_db)):
    return db.query(models.NetWorthItem).order_by(
        models.NetWorthItem.tipo, models.NetWorthItem.orden
    ).all()


@router.get("/entries", response_model=list[NetWorthEntryOut])
def list_entries(anio: int, db: Session = Depends(get_db)):
    return (
        db.query(models.NetWorthEntry)
        .filter(models.NetWorthEntry.anio == anio)
        .order_by(models.NetWorthEntry.item_id, models.NetWorthEntry.mes)
        .all()
    )


@router.put("/entries", response_model=NetWorthEntryOut)
def upsert_entry(payload: NetWorthEntryUpsert, db: Session = Depends(get_db)):
    if not db.get(models.NetWorthItem, payload.item_id):
        raise HTTPException(422, "item_id no existe")
    entry = (
        db.query(models.NetWorthEntry)
        .filter(
            models.NetWorthEntry.item_id == payload.item_id,
            models.NetWorthEntry.anio == payload.anio,
            models.NetWorthEntry.mes == payload.mes,
        )
        .first()
    )
    if entry:
        entry.importe = payload.importe
    else:
        entry = models.NetWorthEntry(**payload.model_dump())
        db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
