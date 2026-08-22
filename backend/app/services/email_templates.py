"""
Professional HTML email templates for all buyer-facing emails.
All templates share the same base layout (header, footer, brand colours).
"""

_BRAND_DARK = "#0f3460"
_BRAND_BLUE = "#3D81E3"
_BRAND_GREEN = "#10b981"

# Buyer-facing broker contact (POs, questions). Replaces the old bids@ address per client request.
BROKERS_EMAIL = "brokers@thinktls.com"


def _base(content: str, preview_text: str = "") -> str:
    """Wraps content in the shared header / footer shell."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>ThinkTLS Bid Desk</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  {"<div style='display:none;max-height:0;overflow:hidden;'>" + preview_text + "&nbsp;" * 120 + "</div>" if preview_text else ""}

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- HEADER -->
        <tr>
          <td style="background:{_BRAND_DARK};border-radius:12px 12px 0 0;padding:28px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="font-size:20px;font-weight:800;color:white;letter-spacing:-0.5px;">ThinkTLS</span>
                  <span style="font-size:13px;font-weight:400;color:rgba(255,255,255,0.5);margin-left:8px;letter-spacing:0.5px;">Bid Desk</span>
                </td>
                <td align="right">
                  <!-- No promotional/urgency badge here: shouty all-caps chips next to a
                       call-to-action are a classic spam-filter signal and read as marketing
                       rather than a procurement notice. -->
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="background:#ffffff;padding:40px 40px 32px;">
            {content}
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f8fafc;border-radius:0 0 12px 12px;border-top:1px solid #e8edf2;padding:20px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;">
                    You received this email because your company is a registered buyer on the ThinkTLS
                    Bid Desk. This is a transactional message about your account or an active bid round.<br/>
                    © ThinkTLS &nbsp;·&nbsp; Confidential — intended solely for the named recipient.
                    If received in error, please disregard and let us know by replying.
                  </p>
                </td>
                <td align="right" style="white-space:nowrap;">
                  <p style="margin:0;font-size:11px;color:#cbd5e1;">Bid Desk Platform</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _cta_button(label: str, url: str, color: str = _BRAND_BLUE) -> str:
    return f"""<table cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
  <tr>
    <td style="background:{color};border-radius:8px;">
      <a href="{url}" style="display:inline-block;padding:14px 28px;color:white;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.2px;">{label} &rarr;</a>
    </td>
  </tr>
</table>"""


def _divider() -> str:
    return '<div style="border-top:1px solid #e8edf2;margin:28px 0;"></div>'


def _credential_box(login_url: str, email: str, password: str) -> str:
    return f"""<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7ff;border:1px solid #bfdbfe;border-radius:10px;margin:20px 0;">
  <tr>
    <td style="padding:20px 24px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:{_BRAND_BLUE};letter-spacing:1px;text-transform:uppercase;">Your Login Credentials</p>
      <table cellpadding="0" cellspacing="0" style="margin-top:14px;width:100%;">
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;width:110px;font-weight:600;">Portal URL</td>
          <td style="padding:6px 0;font-size:13px;"><a href="{login_url}" style="color:{_BRAND_BLUE};text-decoration:none;">{login_url}</a></td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;font-weight:600;">Email</td>
          <td style="padding:6px 0;font-size:13px;color:#1e293b;">{email}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;font-weight:600;">Password</td>
          <td style="padding:6px 0;">
            <span style="font-family:monospace;font-size:14px;background:#dbeafe;color:#1d4ed8;padding:3px 10px;border-radius:5px;font-weight:700;letter-spacing:1px;">{password}</span>
          </td>
        </tr>
      </table>
      <p style="margin:14px 0 0;font-size:11px;color:#94a3b8;">Change your password after first login via the Profile menu.</p>
    </td>
  </tr>
</table>"""


# ─── Public template functions ────────────────────────────────────────────────

def welcome_email(full_name: str, email: str, temp_password: str, login_url: str) -> tuple[str, str]:
    """Returns (subject, html). Sent when admin creates a new buyer account."""
    first = full_name.split()[0]

    content = f"""
      <h1 style="margin:0 0 6px;font-size:24px;font-weight:800;color:#0f172a;letter-spacing:-0.5px;">Welcome to ThinkTLS Bid Desk</h1>
      <p style="margin:0 0 20px;font-size:13px;color:#64748b;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;">Your account is ready</p>

      <p style="font-size:15px;color:#334155;line-height:1.7;">Hi {first},</p>
      <p style="font-size:15px;color:#334155;line-height:1.7;">
        ThinkTLS has set up your buyer account on the Bid Desk platform.
        You can now participate in active bid rounds, track your results, and manage your submissions — all in one place.
      </p>

      {_credential_box(login_url, email, temp_password)}
      {_cta_button("Log In to Bid Desk", login_url)}

      {_divider()}
      <p style="font-size:13px;color:#94a3b8;line-height:1.6;margin:0;">
        Questions? Reply to this email and our team will get back to you promptly.
      </p>
    """
    return (
        "Welcome to ThinkTLS Bid Desk — Your Account is Ready",
        _base(content, f"Your ThinkTLS Bid Desk account is ready, {first}."),
    )


def resend_credentials_email(full_name: str, email: str, temp_password: str, login_url: str) -> tuple[str, str]:
    """Returns (subject, html). Sent when admin resets a buyer's password."""
    first = full_name.split()[0]

    content = f"""
      <h1 style="margin:0 0 6px;font-size:24px;font-weight:800;color:#0f172a;letter-spacing:-0.5px;">Your Login Credentials</h1>
      <p style="margin:0 0 20px;font-size:13px;color:#64748b;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;">Updated by ThinkTLS</p>

      <p style="font-size:15px;color:#334155;line-height:1.7;">Hi {first},</p>
      <p style="font-size:15px;color:#334155;line-height:1.7;">
        Your Bid Desk login credentials have been reset. Use the details below to access your account.
      </p>

      {_credential_box(login_url, email, temp_password)}
      {_cta_button("Log In Now", login_url)}

      {_divider()}
      <p style="font-size:13px;color:#94a3b8;line-height:1.6;margin:0;">
        If you did not request this change, please contact ThinkTLS immediately.
      </p>
    """
    return (
        "ThinkTLS Bid Desk — Your Updated Login Credentials",
        _base(content, "Your Bid Desk credentials have been updated."),
    )


def bid_invitation_email(
    full_name: str, round_name: str, commodity: str,
    deadline: str, upload_url: str,
    notes: str | None = None,
) -> tuple[str, str]:
    """Returns (subject, html). Sent when buyer is invited to a bid round."""
    first = full_name.split()[0]

    content = f"""
      <h1 style="margin:0 0 6px;font-size:24px;font-weight:800;color:#0f172a;letter-spacing:-0.5px;">You've Been Invited to Bid</h1>
      <p style="margin:0 0 20px;font-size:13px;color:{_BRAND_BLUE};font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">{round_name}</p>

      <p style="font-size:15px;color:#334155;line-height:1.7;">Hi {first},</p>
      <p style="font-size:15px;color:#334155;line-height:1.7;">
        ThinkTLS has opened a new procurement round and selected you to participate. Submit your most competitive pricing before the deadline.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin:20px 0;">
        <tr>
          <td style="padding:20px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:6px 0;width:120px;">
                  <span style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">Round</span>
                </td>
                <td style="padding:6px 0;font-size:14px;color:#1e293b;font-weight:600;">{round_name}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;">
                  <span style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">Category</span>
                </td>
                <td style="padding:6px 0;font-size:14px;color:#1e293b;">{commodity.title()}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;">
                  <span style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">Deadline</span>
                </td>
                <td style="padding:6px 0;font-size:14px;color:#dc2626;font-weight:700;">{deadline}</td>
              </tr>
               {notes_row}
            </table>
          </td>
        </tr>
      </table>

      {_cta_button("Upload My Bid", upload_url)}

      {_divider()}
      <p style="font-size:13px;color:#94a3b8;line-height:1.6;margin:0;">
        Submissions are confidential. All pricing is reviewed by the ThinkTLS procurement team only.
        Late submissions will not be accepted.
      </p>
      <p style="font-size:13px;color:#334155;line-height:1.6;margin:12px 0 0;font-weight:600;">
        Payment Terms: Net 48 hours upon deal approval.
      </p>
    """
    return (
        f"ThinkTLS Bid Invitation — {round_name}",
        _base(content, f"You've been invited to submit pricing for {round_name}."),
    )


def results_email(
    full_name: str, round_name: str,
    won_count: int, lost_count: int, portal_url: str,
    won_items: list | None = None, lost_items: list | None = None,
) -> tuple[str, str]:
    """Returns (subject, html). Sent when round results are released to buyer.
    won_items:  dicts with part_number, description, quantity, your_price (the winning price).
    lost_items: dicts with part_number, description, quantity, your_price, winning_price (fluffed).
    The email shows the FULL results — everything won and everything outbid — and reminds winners
    to issue a PO.
    """
    first = full_name.split()[0]
    total = won_count + lost_count
    win_pct = round((won_count / total) * 100) if total > 0 else 0

    win_rate_row = (
        f"<p style='font-size:14px;color:#64748b;text-align:center;margin:8px 0 20px;'>"
        f"Win rate this round: <strong style='color:#0f172a;'>{win_pct}%</strong></p>"
    ) if total > 0 else ""

    # PO instruction — winners must issue a purchase order to close the award.
    po_notice = ""
    if won_count > 0:
        po_notice = f"""
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;">
          <tr><td style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;">
            <p style="margin:0;font-size:14px;color:#92400e;line-height:1.6;">
              <strong>Action required:</strong> Please issue a PO to
              <a href="mailto:{BROKERS_EMAIL}" style="color:#b45309;font-weight:700;">{BROKERS_EMAIL}</a>
              within <strong>24 hours</strong> of the bid being awarded.
            </p>
          </td></tr>
        </table>"""

    # Build the WON detail table (part #, description, qty, your price).
    priced_wins = [item for item in (won_items or []) if item.get("your_price") is not None]
    win_detail = ""
    if priced_wins:
        rows_html = ""
        for item in priced_wins[:25]:  # cap at 25 rows to keep email readable
            pn = str(item.get("part_number") or "")[:40]
            desc = str(item.get("description") or "")[:50]
            qty = item.get("quantity") or 1
            your_p = item["your_price"]
            rows_html += f"""<tr>
              <td style="padding:8px 10px;font-size:11px;font-family:monospace;color:#334155;border-bottom:1px solid #f1f5f9;max-width:160px;overflow:hidden;">{pn}</td>
              <td style="padding:8px 10px;font-size:11px;color:#64748b;border-bottom:1px solid #f1f5f9;max-width:160px;overflow:hidden;">{desc}</td>
              <td style="padding:8px 10px;font-size:12px;font-family:monospace;color:#475569;border-bottom:1px solid #f1f5f9;text-align:right;">{qty}</td>
              <td style="padding:8px 10px;font-size:12px;font-family:monospace;color:#10b981;border-bottom:1px solid #f1f5f9;text-align:right;">${your_p:,.2f}</td>
            </tr>"""
        more_msg = f'<p style="font-size:11px;color:#94a3b8;margin:8px 0 0;">... and {len(priced_wins) - 25} more items won. See full results in your portal.</p>' if len(priced_wins) > 25 else ""
        win_detail = f"""
        {_divider()}
        <p style="font-size:14px;font-weight:700;color:#0f172a;margin:0 0 12px;">Items You Won</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:8px 10px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;text-align:left;">Part #</th>
              <th style="padding:8px 10px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;text-align:left;">Description</th>
              <th style="padding:8px 10px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;text-align:right;">Qty</th>
              <th style="padding:8px 10px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;text-align:right;">Your Price</th>
            </tr>
          </thead>
          <tbody>{rows_html}</tbody>
        </table>
        {more_msg}
        """

    # Build the LOST/outbid detail table (part #, description, qty, your bid, winning price, diff).
    priced_losses = [
        item for item in (lost_items or [])
        if item.get("your_price") is not None and item.get("winning_price") is not None
    ]
    loss_detail = ""
    if priced_losses:
        rows_html = ""
        for item in priced_losses[:25]:
            pn = str(item.get("part_number") or "")[:40]
            desc = str(item.get("description") or "")[:50]
            qty = item.get("quantity") or 1
            your_p = item["your_price"]
            win_p = item["winning_price"]
            diff_pct = round((win_p - your_p) / your_p * 100, 1) if your_p and your_p > 0 else None
            diff_str = f"+{diff_pct}%" if diff_pct is not None and diff_pct > 0 else (f"{diff_pct}%" if diff_pct is not None else "")
            rows_html += f"""<tr>
              <td style="padding:8px 10px;font-size:11px;font-family:monospace;color:#334155;border-bottom:1px solid #f1f5f9;max-width:150px;overflow:hidden;">{pn}</td>
              <td style="padding:8px 10px;font-size:11px;color:#64748b;border-bottom:1px solid #f1f5f9;max-width:150px;overflow:hidden;">{desc}</td>
              <td style="padding:8px 10px;font-size:12px;font-family:monospace;color:#475569;border-bottom:1px solid #f1f5f9;text-align:right;">{qty}</td>
              <td style="padding:8px 10px;font-size:12px;font-family:monospace;color:#475569;border-bottom:1px solid #f1f5f9;text-align:right;">${your_p:,.2f}</td>
              <td style="padding:8px 10px;font-size:12px;font-family:monospace;color:#10b981;border-bottom:1px solid #f1f5f9;text-align:right;">${win_p:,.2f}</td>
              <td style="padding:8px 10px;font-size:11px;color:#dc2626;border-bottom:1px solid #f1f5f9;text-align:right;white-space:nowrap;">{diff_str}</td>
            </tr>"""
        more_msg = f'<p style="font-size:11px;color:#94a3b8;margin:8px 0 0;">... and {len(priced_losses) - 25} more items. See full results in your portal.</p>' if len(priced_losses) > 25 else ""
        loss_detail = f"""
        {_divider()}
        <p style="font-size:14px;font-weight:700;color:#0f172a;margin:0 0 12px;">Items You Were Outbid</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:8px 10px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;text-align:left;">Part #</th>
              <th style="padding:8px 10px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;text-align:left;">Description</th>
              <th style="padding:8px 10px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;text-align:right;">Qty</th>
              <th style="padding:8px 10px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;text-align:right;">Your Bid</th>
              <th style="padding:8px 10px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;text-align:right;">Winning Price</th>
              <th style="padding:8px 10px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;text-align:right;">Difference</th>
            </tr>
          </thead>
          <tbody>{rows_html}</tbody>
        </table>
        {more_msg}
        <p style="font-size:11px;color:#94a3b8;margin:8px 0 0;">* Winning prices shown are indicative. Actual transaction prices are confidential.</p>
        """

    content = f"""
      <h1 style="margin:0 0 6px;font-size:24px;font-weight:800;color:#0f172a;letter-spacing:-0.5px;">Your Bid Results Are Ready</h1>
      <p style="margin:0 0 20px;font-size:13px;color:#64748b;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;">{round_name}</p>

      <p style="font-size:15px;color:#334155;line-height:1.7;">Hi {first},</p>
      <p style="font-size:15px;color:#334155;line-height:1.7;">
        ThinkTLS has completed the evaluation for <strong>{round_name}</strong>. Your results are now available in the portal.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
        <tr>
          <td width="48%" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px 24px;text-align:center;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:0.8px;">Items Won</p>
            <p style="margin:0;font-size:36px;font-weight:800;color:#15803d;">{won_count}</p>
          </td>
          <td width="4%"></td>
          <td width="48%" style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:20px 24px;text-align:center;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.8px;">Items Lost</p>
            <p style="margin:0;font-size:36px;font-weight:800;color:#b91c1c;">{lost_count}</p>
          </td>
        </tr>
      </table>

      {win_rate_row}
      {po_notice}
      {win_detail}
      {loss_detail}
      {_cta_button("View My Full Results", portal_url, _BRAND_GREEN)}

      {_divider()}
      <p style="font-size:13px;color:#94a3b8;line-height:1.6;margin:0;">
        Detailed line-item results including pricing comparisons are available in your portal.
        All competitor pricing is confidential and not disclosed.
      </p>
    """
    return (
        f"ThinkTLS Bid Results — {round_name}",
        _base(content, f"Your results for {round_name} are ready — {won_count} items won."),
    )


def lines_removed_email(
    full_name: str, round_name: str, items: list, portal_url: str,
) -> tuple[str, str]:
    """Returns (subject, html). Sent when an admin removes bid line(s) from a round.

    A removed line silently stopped competing — the buyer had no idea their price was out,
    which for a flagged price typo is exactly the moment they'd want to know. items: dicts
    with part_number, price, reason.
    """
    first = full_name.split()[0] if full_name else "there"
    n = len(items)
    rows = ""
    for it in items[:25]:
        price = it.get("price")
        price_str = f"${price:,.2f}" if isinstance(price, (int, float)) else "—"
        rows += f"""<tr>
          <td style="padding:8px 10px;font-size:11px;font-family:monospace;color:#334155;border-bottom:1px solid #f1f5f9;">{str(it.get('part_number') or '')[:44]}</td>
          <td style="padding:8px 10px;font-size:12px;font-family:monospace;color:#475569;border-bottom:1px solid #f1f5f9;text-align:right;">{price_str}</td>
          <td style="padding:8px 10px;font-size:11px;color:#64748b;border-bottom:1px solid #f1f5f9;">{str(it.get('reason') or 'Removed by ThinkTLS')[:90]}</td>
        </tr>"""
    more = (f'<p style="font-size:11px;color:#94a3b8;margin:8px 0 0;">…and {n - 25} more. '
            f'See your full submission in the portal.</p>') if n > 25 else ""

    content = f"""
      <h1 style="margin:0 0 6px;font-size:24px;font-weight:800;color:#0f172a;letter-spacing:-0.5px;">
        {'A Line Was' if n == 1 else 'Some Lines Were'} Removed From Your Bid</h1>
      <p style="margin:0 0 20px;font-size:13px;color:#64748b;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;">{round_name}</p>

      <p style="font-size:15px;color:#334155;line-height:1.7;">Hi {first},</p>
      <p style="font-size:15px;color:#334155;line-height:1.7;">
        {'One line has' if n == 1 else f'{n} lines have'} been removed from your submission for
        <strong>{round_name}</strong> and will not compete for an award. This usually happens when a
        price looks like a data-entry error (for example an extra digit or a missing decimal).
        The rest of your bid is unaffected.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:20px 0;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:8px 10px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;text-align:left;">Part #</th>
            <th style="padding:8px 10px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;text-align:right;">Your Bid</th>
            <th style="padding:8px 10px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;text-align:left;">Reason</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
      {more}

      <p style="font-size:15px;color:#334155;line-height:1.7;">
        If the price was correct as submitted, reply to this email and we can review it before the round closes.
      </p>

      {_cta_button("View My Submission", portal_url)}
    """
    subject = (
        f"ThinkTLS: {'a line was' if n == 1 else f'{n} lines were'} removed from your bid — {round_name}"
    )
    return subject, _base(content, preview_text=f"{n} line(s) removed from your bid for {round_name}")


def password_reset_email(full_name: str, reset_url: str) -> tuple[str, str]:
    """Returns (subject, html). Sent on forgot-password request."""
    first = full_name.split()[0]
    content = f"""
      <h1 style="margin:0 0 6px;font-size:24px;font-weight:800;color:#0f172a;letter-spacing:-0.5px;">Reset Your Password</h1>
      <p style="margin:0 0 20px;font-size:13px;color:#64748b;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;">Security Request</p>

      <p style="font-size:15px;color:#334155;line-height:1.7;">Hi {first},</p>
      <p style="font-size:15px;color:#334155;line-height:1.7;">
        We received a request to reset the password for your ThinkTLS Bid Desk account.
        Click the button below — this link is valid for <strong>2 hours</strong>.
      </p>

      {_cta_button("Reset My Password", reset_url, "#dc2626")}

      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;margin:20px 0;">
        <tr>
          <td style="padding:14px 18px;">
            <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
              <strong>Didn't request this?</strong> You can safely ignore this email. Your password will not change unless you click the link above.
            </p>
          </td>
        </tr>
      </table>

      {_divider()}
      <p style="font-size:13px;color:#94a3b8;line-height:1.6;margin:0;">
        For security, this link expires in 2 hours. If you need a new one, visit the login page and use "Forgot Password" again.
      </p>
    """
    return (
        "ThinkTLS Bid Desk — Password Reset Request",
        _base(content, "Reset your ThinkTLS Bid Desk password."),
    )
