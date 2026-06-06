import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get("x-email-secret");
    if (!secret || secret !== process.env.EMAIL_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { to_email, to_name, subject, html_body } = await req.json();
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

    await transporter.sendMail({
      from: `"ThinkTLS Bid Desk" <${gmailUser}>`,
      to: `${to_name} <${to_email}>`,
      subject,
      html: html_body,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[send-email] error:", err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
