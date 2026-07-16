import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

/**
 * Derive a readable plain-text body from the HTML.
 * Every message MUST ship a text/plain alternative: an HTML-only email is one of the
 * strongest spam signals there is, and was a major reason these landed in Gmail's spam
 * folder. Callers may pass their own text_body; otherwise we generate a decent one.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Keep link targets visible in the text part: "label (https://…)"
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
      const text = String(label).replace(/<[^>]+>/g, "").trim();
      return text ? `${text} (${href})` : String(href);
    })
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/td>/gi, "\t")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get("x-email-secret");
    if (!secret || secret !== process.env.EMAIL_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { to_email, to_name, subject, html_body, text_body } = await req.json();
    if (!to_email || !subject || !html_body) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailPass) {
      return NextResponse.json({ error: "Gmail env vars not set" }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });

    // Gmail SMTP rewrites From to the authenticated account, so the envelope sender must stay
    // gmailUser for SPF/DKIM to align (misaligned From is itself a spam trigger). Reply-To
    // carries the address humans should actually answer to.
    const replyTo = process.env.REPLY_TO_EMAIL || gmailUser;
    const fromName = process.env.FROM_NAME || "ThinkTLS Bid Desk";

    await transporter.sendMail({
      from: `"${fromName}" <${gmailUser}>`,
      to: to_name ? `"${to_name}" <${to_email}>` : to_email,
      replyTo,
      subject,
      text: (text_body && String(text_body).trim()) || htmlToText(html_body),
      html: html_body,
      headers: {
        // Transactional mail best-practice headers — their absence hurts placement.
        "List-Unsubscribe": `<mailto:${replyTo}?subject=Unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "Auto-Submitted": "auto-generated",
        "X-Auto-Response-Suppress": "OOF, AutoReply",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[send-email] error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
