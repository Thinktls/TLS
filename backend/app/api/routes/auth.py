from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.user import User
from app.core.security import verify_password, hash_password, create_access_token, get_current_user, require_admin
from app.schemas.auth import LoginRequest, TokenResponse, UserCreate, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, role=user.role, user_id=user.id, full_name=user.full_name)


@router.get("/me", response_model=UserOut)
def me(current_user=Depends(get_current_user)):
    return current_user


@router.post("/buyers", response_model=UserOut)
def create_buyer(req: UserCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=req.email,
        hashed_password=hash_password(req.password),
        full_name=req.full_name,
        company_name=req.company_name,
        role=req.role,
        fluff_percentage=req.fluff_percentage,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/buyers", response_model=list[UserOut])
def list_buyers(db: Session = Depends(get_db), _=Depends(require_admin)):
    return db.query(User).filter(User.role == "buyer").all()


@router.patch("/buyers/{user_id}/toggle", response_model=UserOut)
def toggle_buyer(user_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)
    return user


@router.patch("/buyers/{user_id}/fluff", response_model=UserOut)
def set_fluff(user_id: int, fluff_percentage: float, db: Session = Depends(get_db), _=Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.fluff_percentage = fluff_percentage
    db.commit()
    db.refresh(user)
    return user


@router.get("/buyers/{user_id}/profile")
def buyer_profile(user_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    from app.models.bid_line import BidLine
    from app.models.deal import Deal

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    lines = db.query(BidLine).filter(BidLine.buyer_id == user_id, BidLine.match_status == "matched").all()
    deals = db.query(Deal).filter(Deal.winning_buyer_id == user_id, Deal.status == "approved").all()

    # Recent bid history — last 20 lines
    recent = sorted(lines, key=lambda l: l.created_at or 0, reverse=True)[:20]

    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "company_name": user.company_name,
        "is_active": user.is_active,
        "fluff_percentage": user.fluff_percentage,
        "fluff_enabled": user.fluff_enabled,
        "win_rate": round(user.win_rate * 100, 1) if user.win_rate else 0.0,
        "total_lines_won": user.total_lines_won or 0,
        "total_lines_bid": user.total_lines_bid or 0,
        "total_margin_contribution": round(user.total_margin_contribution or 0, 2),
        "buyer_score": round(user.buyer_score or 0, 1),
        "last_bid_at": user.last_bid_at,
        "last_win_date": user.last_win_date,
        "score_updated_at": user.score_updated_at,
        "total_deal_value": round(sum(d.total_value for d in deals), 2),
        "total_deals_won": len(deals),
    }
