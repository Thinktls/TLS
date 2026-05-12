"""
Notification feed — admin gets alerts for file uploads, deal approvals, Razor push failures.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.db.session import get_db
from app.core.security import require_admin
from app.models.notification import Notification

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationCreate(BaseModel):
    title: str
    body: Optional[str] = None
    category: str = "info"
    link: Optional[str] = None
    recipient_role: str = "admin"
    recipient_id: Optional[int] = None


@router.get("")
def list_notifications(
    limit: int = 30,
    unread_only: bool = False,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    q = db.query(Notification).filter(Notification.recipient_role == "admin")
    if unread_only:
        q = q.filter(Notification.read == False)
    notifications = q.order_by(Notification.created_at.desc()).limit(limit).all()
    return [
        {
            "id": n.id,
            "title": n.title,
            "body": n.body,
            "category": n.category,
            "link": n.link,
            "read": n.read,
            "created_at": n.created_at,
        }
        for n in notifications
    ]


@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), _=Depends(require_admin)):
    count = db.query(Notification).filter(
        Notification.recipient_role == "admin",
        Notification.read == False,
    ).count()
    return {"count": count}


@router.patch("/{notification_id}/read")
def mark_read(notification_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    n = db.query(Notification).filter(Notification.id == notification_id).first()
    if n:
        n.read = True
        db.commit()
    return {"ok": True}


@router.patch("/read-all")
def mark_all_read(db: Session = Depends(get_db), _=Depends(require_admin)):
    db.query(Notification).filter(
        Notification.recipient_role == "admin",
        Notification.read == False,
    ).update({"read": True})
    db.commit()
    return {"ok": True}


def create_notification(db: Session, title: str, body: str = None, category: str = "info", link: str = None):
    """Utility called by other services to emit a notification."""
    n = Notification(title=title, body=body, category=category, link=link, recipient_role="admin")
    db.add(n)
    db.commit()
    return n
