from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.deps import get_db
from app.schemas import GoalCreate, GoalOut, GoalUpdate

router = APIRouter(prefix="/goals", tags=["goals"])


def _to_out(g: models.Goal) -> GoalOut:
    out = GoalOut.model_validate(g)
    out.progreso = float(g.ahorrado / g.meta) if g.meta else None
    out.falta = g.meta - g.ahorrado
    if g.fecha_objetivo:
        hoy = date.today()
        meses = max(1, (g.fecha_objetivo.year - hoy.year) * 12 + g.fecha_objetivo.month - hoy.month)
        out.meses_restantes = meses
        out.aportar_al_mes = (g.meta - g.ahorrado) / meses
    return out


@router.get("", response_model=list[GoalOut])
def list_goals(db: Session = Depends(get_db)):
    return [_to_out(g) for g in db.query(models.Goal).order_by(models.Goal.orden).all()]


@router.post("", response_model=GoalOut, status_code=201)
def create_goal(payload: GoalCreate, db: Session = Depends(get_db)):
    g = models.Goal(**payload.model_dump())
    db.add(g)
    db.commit()
    db.refresh(g)
    return _to_out(g)


@router.patch("/{goal_id}", response_model=GoalOut)
def update_goal(goal_id: int, payload: GoalUpdate, db: Session = Depends(get_db)):
    g = db.get(models.Goal, goal_id)
    if not g:
        raise HTTPException(404, "Objetivo no encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(g, field, value)
    db.commit()
    db.refresh(g)
    return _to_out(g)


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    g = db.get(models.Goal, goal_id)
    if not g:
        raise HTTPException(404, "Objetivo no encontrado")
    db.delete(g)
    db.commit()
