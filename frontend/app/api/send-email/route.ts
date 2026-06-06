import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-email-secret");
  if (!secret || secret !== process.env.EMAIL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { to_email, to_name, subject, html_body } = await req.json();
  if (!to_email || !subject || !html_body) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"ThinkTLS Bid Desk" <${process.env.GMAIL_USER}>`,
    to: `${to_name} <${to_email}>`,
    subject,
    html: html_body,
  });

  return NextResponse.json({ ok: true });
}
