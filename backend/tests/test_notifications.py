"""
Tests for the notification feed endpoints.
"""


def test_list_notifications_empty(client, admin_token):
    resp = client.get("/api/notifications", headers=admin_token)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_unread_count(client, admin_token):
    resp = client.get("/api/notifications/unread-count", headers=admin_token)
    assert resp.status_code == 200
    assert "count" in resp.json()


def test_mark_all_read(client, admin_token, db):
    from app.models.notification import Notification
    n = Notification(title="Test notif", recipient_role="admin", category="info")
    db.add(n)
    db.commit()

    resp = client.patch("/api/notifications/read-all", headers=admin_token)
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    count_resp = client.get("/api/notifications/unread-count", headers=admin_token)
    assert count_resp.json()["count"] == 0


def test_mark_single_read(client, admin_token, db):
    from app.models.notification import Notification
    n = Notification(title="Single notif", recipient_role="admin", category="warning")
    db.add(n)
    db.commit()

    resp = client.patch(f"/api/notifications/{n.id}/read", headers=admin_token)
    assert resp.status_code == 200

    notifs = client.get("/api/notifications", headers=admin_token).json()
    matching = [x for x in notifs if x["id"] == n.id]
    assert matching[0]["read"] is True


def test_notifications_require_auth(client):
    resp = client.get("/api/notifications")
    assert resp.status_code in (401, 403)
