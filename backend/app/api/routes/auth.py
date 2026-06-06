import secrets
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.user import User
from app.models.invite_token import InviteToken
from app.core.security import verify_password, hash_password, create_access_token, get_current_user, require_admin
from app.schemas.auth import LoginRequest, TokenResponse, UserCreate, UserOut
from app.services.email_service import _send as send_email
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

# In-memory rate limiter: 10 attempts per 5 minutes per IP
_login_attempts: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW = 300  # 5 minutes
_RATE_LIMIT = 10


def _check_rate_limit(client_ip: str):
    now = time.time()
    attempts = _login_attempts[client_ip]
    # Purge entries older than window
    _login_attempts[client_ip] = [t for t in attempts if now - t < _RATE_WINDOW]
    if len(_login_attempts[client_ip]) >= _RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again in 5 minutes.")
    _login_attempts[client_ip].append(now)


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")
    # Clear rate limit on successful login
    _login_attempts.pop(client_ip, None)
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, role=user.role, user_id=user.id, full_name=user.full_name)


@router.get("/me", response_model=UserOut)
def me(current_user=Depends(get_current_user)):
    return current_user


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/me/change-password")
def change_password(req: ChangePasswordRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not verify_password(req.current_password, current_user.hashed_password):
        raise HTTPException(400, "Current password is incorrect")
    if len(req.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    current_user.hashed_password = hash_password(req.new_password)
    db.commit()
    return {"message": "Password updated successfully"}


@router.post("/buyers")
def create_buyer(req: UserCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db), _=Depends(require_admin)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Auto-generate a temporary password if not provided
    temp_password = req.password if req.password else secrets.token_urlsafe(10)

    user = User(
        email=req.email,
        hashed_password=hash_password(temp_password),
        full_name=req.full_name,
        company_name=req.company_name,
        role=req.role,
        fluff_percentage=req.fluff_percentage,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    from app.services.email_templates import welcome_email
    _subject, _html = welcome_email(user.full_name, user.email, temp_password, f"{settings.FRONTEND_URL}/login")
    background_tasks.add_task(send_email, user.email, user.full_name, _subject, _html)

    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "company_name": user.company_name,
        "is_active": user.is_active,
        "fluff_percentage": user.fluff_percentage,
        "buyer_score": user.buyer_score,
        "temp_password": temp_password,
    }


@router.get("/buyers", response_model=list[UserOut])
def list_buyers(db: Session = Depends(get_db), _=Depends(require_admin)):
    return db.query(User).filter(User.role == "buyer").all()


@router.delete("/buyers/{user_id}")
def delete_buyer(user_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id, User.role == "buyer").first()
    if not user:
        raise HTTPException(status_code=404, detail="Buyer not found")
    db.delete(user)
    db.commit()
    return {"deleted": True}


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


@router.patch("/buyers/{user_id}/fluff-toggle", response_model=UserOut)
def toggle_fluff(user_id: int, fluff_enabled: bool, db: Session = Depends(get_db), _=Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.fluff_enabled = fluff_enabled
    db.commit()
    db.refresh(user)
    return user


class PasswordSetup(BaseModel):
    token: str
    new_password: str


@router.post("/buyers/{user_id}/send-invite")
def send_invite(user_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Reset buyer's password to a new temp one and email their credentials."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    temp_password = secrets.token_urlsafe(10)
    user.hashed_password = hash_password(temp_password)
    db.commit()

    from app.services.email_templates import resend_credentials_email
    _subject, _html = resend_credentials_email(user.full_name, user.email, temp_password, f"{settings.FRONTEND_URL}/login")
    background_tasks.add_task(send_email, user.email, user.full_name, _subject, _html)
    return {"message": f"Credentials sent to {user.email}", "temp_password": temp_password, "email": user.email}


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


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


# Re-use InviteToken table for password reset (token purpose is "reset")
@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Send a password-reset link. Always responds 200 to prevent email enumeration."""
    user = db.query(User).filter(User.email == req.email).first()
    if user and user.is_active:
        db.query(InviteToken).filter(InviteToken.buyer_id == user.id, InviteToken.used == False).delete()
        token_str = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(hours=2)
        token = InviteToken(token=token_str, buyer_id=user.id, expires_at=expires)
        db.add(token)
        db.commit()
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token_str}"
        from app.services.email_templates import password_reset_email
        _subject, _html = password_reset_email(user.full_name, reset_url)
        send_email(user.email, user.full_name, _subject, _html)
    return {"message": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    token = db.query(InviteToken).filter(InviteToken.token == req.token, InviteToken.used == False).first()
    if not token:
        raise HTTPException(400, "Invalid or expired reset token")
    if token.expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, "Reset token has expired — request a new one")
    if len(req.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    user = db.query(User).filter(User.id == token.buyer_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.hashed_password = hash_password(req.new_password)
    token.used = True
    db.commit()
    return {"message": "Password reset successfully. You can now log in."}


@router.get("/buyers/compare")
def compare_buyers(db: Session = Depends(get_db), _=Depends(require_admin)):
    """
    Returns all buyers with full performance metrics for the comparison dashboard.
    Includes per-round participation breakdown.
    """
    from app.models.bid_line import BidLine
    from app.models.deal import Deal
    from app.models.bid_round import BidRound

    buyers = db.query(User).filter(User.role == "buyer").order_by(User.total_margin_contribution.desc()).all()
    all_rounds = db.query(BidRound).order_by(BidRound.created_at.desc()).limit(10).all()

    rows = []
    for b in buyers:
        # Per-round participation
        round_participation = []
        for r in all_rounds:
            lines = db.query(BidLine).filter(BidLine.bid_round_id == r.id, BidLine.buyer_id == b.id, BidLine.match_status == "matched").count()
            won = db.query(BidLine).filter(BidLine.bid_round_id == r.id, BidLine.buyer_id == b.id, BidLine.is_winner == True).count()
            round_participation.append({
                "round_id": r.id,
                "round_name": r.name,
                "lines_bid": lines,
                "lines_won": won,
                "participated": lines > 0,
            })

        deals = db.query(Deal).filter(Deal.winning_buyer_id == b.id, Deal.status == "approved").all()
        rows.append({
            "id": b.id,
            "full_name": b.full_name,
            "company_name": b.company_name or b.full_name,
            "email": b.email,
            "is_active": b.is_active,
            "fluff_percentage": b.fluff_percentage,
            "fluff_enabled": b.fluff_enabled,
            "win_rate_pct": round((b.win_rate or 0) * 100, 1),
            "total_lines_bid": b.total_lines_bid or 0,
            "total_lines_won": b.total_lines_won or 0,
            "total_margin_contribution": round(b.total_margin_contribution or 0, 2),
            "buyer_score": round(b.buyer_score or 0, 1),
            "total_deal_value": round(sum(d.total_value for d in deals), 2),
            "total_deals_won": len(deals),
            "last_bid_at": b.last_bid_at.isoformat() if b.last_bid_at else None,
            "last_win_date": b.last_win_date.isoformat() if b.last_win_date else None,
            "rounds_participated": sum(1 for rp in round_participation if rp["participated"]),
            "round_participation": round_participation,
        })

    return {
        "buyers": rows,
        "rounds": [{"id": r.id, "name": r.name, "status": r.status} for r in all_rounds],
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
