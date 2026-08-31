"""Transactional email delivery through the configured Hostinger SMTP server."""
import asyncio
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from datetime import datetime, timezone
from typing import Any, Dict

from backend.database import db_store

logger = logging.getLogger("scrolic.email")


def _frontend_base_url() -> str:
    return (os.environ.get("FRONTEND_BASE_URL") or "http://localhost:3000").strip().rstrip("/")


class EmailService:
    async def _send(self, user_id: str, recipient: str, email_type: str, subject: str, html: str) -> bool:
        smtp_host = os.environ.get("SMTP_HOST", "smtp.hostinger.com").strip()
        smtp_port = int(os.environ.get("SMTP_PORT", "465"))
        smtp_user = os.environ.get("SMTP_USER", "").strip()
        smtp_password = os.environ.get("SMTP_PASSWORD", "")
        sender = os.environ.get("EMAIL_FROM", "team@scrolic.id").strip()
        reply_to = os.environ.get("REPLY_TO", "support@scrolic.id").strip()
        provider = "hostinger_smtp"
        sent_at = datetime.now(timezone.utc)
        status = "failed"
        error_message = None

        try:
            if not smtp_user or not smtp_password:
                raise ValueError("SMTP_USER/SMTP_PASSWORD belum dikonfigurasi")
            message = EmailMessage()
            message["From"] = sender
            message["To"] = recipient
            message["Subject"] = subject
            if reply_to:
                message["Reply-To"] = reply_to
            message.set_content("Email HTML diperlukan untuk melihat pesan ini.")
            message.add_alternative(html, subtype="html")
            loop = asyncio.get_running_loop()
            def deliver():
                context = ssl.create_default_context()
                smtp = smtplib.SMTP_SSL(smtp_host, smtp_port, context=context, timeout=12) if os.environ.get("SMTP_SECURE", "true").lower() == "true" else smtplib.SMTP(smtp_host, smtp_port, timeout=12)
                with smtp:
                    if os.environ.get("SMTP_SECURE", "true").lower() != "true":
                        smtp.starttls(context=context)
                    smtp.login(smtp_user, smtp_password)
                    smtp.send_message(message)
            await loop.run_in_executor(None, deliver)
            status = "sent"
            return True
        except Exception as exc:
            error_message = str(exc)[:500]
            logger.warning("[Email] %s delivery failed for user_id=%s", email_type, user_id)
            return False
        finally:
            db_store.create_email_log({
                "user_id": user_id,
                "email": recipient,
                "type": email_type,
                "status": status,
                "provider": provider,
                "sent_at": sent_at,
                "error_message": error_message,
            })

    async def send_welcome_email(self, user_id: str, recipient: str, username: str, email_address: str) -> bool:
        html = f"""
        <!DOCTYPE html>
        <html lang="id">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Selamat Datang di Scrolic</title>
        </head>
        <body style="margin:0;padding:0;background:#07130c;font-family:Arial,Helvetica,sans-serif;color:#e5e7eb;">
          <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
            <div style="background:linear-gradient(135deg,#0b1b12,#112817);border:1px solid rgba(16,185,129,0.25);border-radius:20px;padding:28px;">
              <div style="display:flex;align-items:center;justify-content:center;margin-bottom:18px;">
                <div style="width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,#10b981,#34d399);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;color:#04130c;box-shadow:0 10px 25px rgba(16,185,129,0.25);">S</div>
              </div>
              <div style="text-align:center;font-size:12px;letter-spacing:2px;color:#86efac;text-transform:uppercase;font-weight:700;">Scrolic</div>
              <h1 style="margin:18px 0 10px;text-align:center;font-size:32px;line-height:1.2;color:#f5f5f5;">Selamat Datang di Scrolic 🚀</h1>
              <p style="margin:0 0 18px;text-align:center;color:#d1d5db;font-size:16px;line-height:1.6;">
                Halo <strong style="color:#fff;">{username}</strong>, akun Anda berhasil dibuat.
              </p>
              <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:16px;padding:18px 16px;margin:18px 0;">
                <p style="margin:0 0 8px;color:#c7f9d5;font-size:14px;font-weight:700;">Detail akun</p>
                <p style="margin:4px 0;color:#e5e7eb;font-size:14px;">Username: <strong>{username}</strong></p>
                <p style="margin:4px 0;color:#e5e7eb;font-size:14px;">Email: <strong>{email_address}</strong></p>
                <p style="margin:4px 0;color:#e5e7eb;font-size:14px;">Status: <strong>Berhasil dibuat</strong></p>
              </div>
              <p style="margin:20px 0 0;text-align:center;color:#d1d5db;font-size:15px;line-height:1.6;">
                Anda sudah siap untuk mulai menjelajah, mengikuti insight trading, dan membangun performa di platform social investing Scrolic.
              </p>
            </div>
            <div style="text-align:center;padding-top:22px;color:#9ca3af;font-size:12px;line-height:1.8;">
              <div style="font-weight:700;color:#d1fae5;">Scrolic — Scroll. Trade. Earn.</div>
              <div>Platform social investing untuk berbagi insight dan performa trading.</div>
            </div>
          </div>
        </body>
        </html>
        """
        return await self._send(user_id, recipient, "welcome", "Selamat Datang di Scrolic 🚀", html)

    async def send_registration_verification_email(self, user_id: str, recipient: str, token: str) -> bool:
        return False

    async def send_password_reset_email(self, user_id: str, recipient: str, token: str) -> bool:
        link = f"{_frontend_base_url()}/reset-password?token={token}"
        html = f"""
        <!DOCTYPE html>
        <html lang="id">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Reset Password Scrolic</title>
        </head>
        <body style="margin:0;padding:0;background:#07130c;font-family:Arial,Helvetica,sans-serif;color:#e5e7eb;">
          <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
            <div style="background:linear-gradient(135deg,#0b1b12,#112817);border:1px solid rgba(16,185,129,0.25);border-radius:20px;padding:28px;">
              <div style="display:flex;align-items:center;justify-content:center;margin-bottom:18px;">
                <div style="width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,#10b981,#34d399);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;color:#04130c;box-shadow:0 10px 25px rgba(16,185,129,0.25);">S</div>
              </div>
              <div style="text-align:center;font-size:12px;letter-spacing:2px;color:#86efac;text-transform:uppercase;font-weight:700;">Scrolic</div>
              <h1 style="margin:18px 0 12px;text-align:center;font-size:30px;line-height:1.2;color:#f5f5f5;">Reset Password</h1>
              <p style="margin:0 0 18px;text-align:center;color:#d1d5db;font-size:16px;line-height:1.6;">
                Kami menerima permintaan untuk mengatur ulang password akun Scrolic Anda.
              </p>
              <div style="text-align:center;margin:28px 0;">
                <a href="{link}" style="display:inline-block;background:linear-gradient(135deg,#10b981,#34d399);color:#04130c;text-decoration:none;padding:14px 26px;border-radius:12px;font-weight:700;">Reset Password</a>
              </div>
              <p style="margin:0;text-align:center;color:#9ca3af;font-size:14px;line-height:1.6;">
                Jika Anda tidak meminta reset password, abaikan email ini. Link ini hanya berlaku untuk waktu yang terbatas.
              </p>
            </div>
            <div style="text-align:center;padding-top:22px;color:#9ca3af;font-size:12px;line-height:1.8;">
              <div style="font-weight:700;color:#d1fae5;">Scrolic — Scroll. Trade. Earn.</div>
              <div>Platform social investing untuk berbagi insight dan performa trading.</div>
            </div>
          </div>
        </body>
        </html>
        """
        return await self._send(user_id, recipient, "reset_password", "Reset password Scrolic", html)

    async def send_security_alert_email(self, user_id: str, recipient: str, activity: str, occurred_at: str) -> bool:
        html = f"<h1>Peringatan keamanan Scrolic</h1><p>Aktivitas penting: <strong>{activity}</strong></p><p>Waktu: {occurred_at}</p><p>Jika aktivitas ini bukan Anda, segera reset password dan hubungi dukungan Scrolic.</p>"
        return await self._send(user_id, recipient, "security_alert", "Peringatan keamanan akun Scrolic", html)

    async def sendRegistrationVerificationEmail(self, user_id: str, recipient: str, token: str) -> bool:
        return await self.send_registration_verification_email(user_id, recipient, token)

    async def sendPasswordResetEmail(self, user_id: str, recipient: str, token: str) -> bool:
        return await self.send_password_reset_email(user_id, recipient, token)


email_service = EmailService()
