import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.user import User
from app.models.invite_token import InviteToken
from app.core.security import verify_password, hash_password, create_access_token, get_current_user, require_admin
from app.schemas.auth import LoginRequest, TokenResponse, UserCreate, UserOut
from app.services.email_service import _send as send_email

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


class PasswordSetup(BaseModel):
    token: str
    new_password: str


@router.post("/buyers/{user_id}/send-invite")
def send_invite(user_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Generate a one-time password-setup token and email it to the buyer."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    # Invalidate any existing unused tokens
    db.query(InviteToken).filter(InviteToken.buyer_id == user_id, InviteToken.used == False).delete()

    token_str = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=72)
    token = InviteToken(token=token_str, buyer_id=user_id, expires_at=expires)
    db.add(token)
    db.commit()

    setup_url = f"http://localhost:3000/setup-password?token={token_str}"
    send_email(
        user.email,
        user.full_name,
        "ThinkTLS Bid Desk — Set up your account",
        f"""
        <h2>Welcome to ThinkTLS Bid Desk</h2>
        <p>Hello {user.full_name},</p>
        <p>Your account has been created. Click the button below to set your password and access the platform.</p>
        <p><a href="{setup_url}" style="background:#3D81E3;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;">
          Set Up My Account →
        </a></p>
        <p style="color:#999;font-size:12px;">This link expires in 72 hours. If you did not expect this email, please ignore it.</p>
        <hr/>
        <p style="color:#666;font-size:11px;">ThinkTLS Bid Desk — Confidential</p>
        """,
    )
    return {"message": f"Invite sent to {user.email}", "expires_at": expires}


@router.post("/setup-password")
def setup_password(req: PasswordSetup, db: Session = Depends(get_db)):
    """Buyer uses a one-time token to set their initial password."""
    token = (
        db.query(InviteToken)
        .filter(InviteToken.token == req.token, InviteToken.used == False)
        .first()
    )
    if not token:
        raise HTTPException(400, "Invalid or expired invite token")
    if token.expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, "Invite token has expired — ask admin to resend")
    if len(req.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    user = db.query(User).filter(User.id == token.buyer_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    user.hashed_password = hash_password(req.new_password)
    user.is_active = True
    token.used = True
    db.commit()

    jwt_token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=jwt_token, role=user.role, user_id=user.id, full_name=user.full_name)


@router.get("/invite/validate")
def validate_invite_token(token: str, db: Session = Depends(get_db)):
    """Check if an invite token is valid before showing the setup form."""
    t = db.query(InviteToken).filter(InviteToken.token == token, InviteToken.used == False).first()
    if not t or t.expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, "Invalid or expired token")
    user = db.query(User).filter(User.id == t.buyer_id).first()
    return {
        "valid": True,
        "buyer_name": user.full_name if user else "",
        "email": user.email if user else "",
        "expires_at": t.expires_at,
    }


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
