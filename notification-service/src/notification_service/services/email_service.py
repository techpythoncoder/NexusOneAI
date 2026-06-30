import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from notification_service.core.config import settings

logger = logging.getLogger(__name__)

# ── Brand constants ────────────────────────────────────────────────────────────
_BRAND_COLOR = "#6366f1"       # indigo-500
_BRAND_DARK  = "#4f46e5"       # indigo-600
_TEXT_DARK   = "#111827"       # gray-900
_TEXT_MID    = "#6b7280"       # gray-500
_TEXT_LIGHT  = "#9ca3af"       # gray-400
_BG_BODY     = "#f3f4f6"       # gray-100
_BG_CARD     = "#ffffff"
_BORDER      = "#e5e7eb"       # gray-200


def _base_html(title: str, preview: str, body_html: str) -> str:
    """Wrap any email body in the NexusOne AI branded shell."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>{title}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings>
    <o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }}
    img {{ border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }}
    table {{ border-collapse: collapse !important; }}
    a {{ color: {_BRAND_COLOR}; }}
    @media only screen and (max-width: 600px) {{
      .email-wrapper {{ width: 100% !important; padding: 0 !important; }}
      .email-card {{ border-radius: 0 !important; }}
      .email-body {{ padding: 32px 24px !important; }}
      .btn {{ display: block !important; width: 100% !important; text-align: center !important; }}
    }}
  </style>
</head>
<body style="background-color:{_BG_BODY}; font-family:'Inter',Arial,sans-serif; margin:0; padding:0;">
  <!-- Preview text (hidden) -->
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">
    {preview}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:{_BG_BODY}; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table class="email-wrapper" role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px; width:100%;">

          <!-- ── Logo header ── -->
          <tr>
            <td align="center" style="padding: 0 0 24px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:linear-gradient(135deg,{_BRAND_COLOR} 0%,{_BRAND_DARK} 100%);
                              border-radius:12px; padding:10px 18px; display:inline-block;">
                    <span style="font-family:'Inter',Arial,sans-serif; font-size:20px; font-weight:700;
                                 color:#ffffff; letter-spacing:-0.5px; white-space:nowrap;">
                      ⬡ NexusOne AI
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Card ── -->
          <tr>
            <td class="email-card" style="background:{_BG_CARD}; border-radius:16px;
                                           border:1px solid {_BORDER}; overflow:hidden;
                                           box-shadow:0 4px 24px rgba(0,0,0,0.06);">
              {body_html}
            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td style="padding: 28px 0 0 0; text-align:center;">
              <p style="font-size:12px; color:{_TEXT_LIGHT}; line-height:1.6; margin:0;">
                NexusOne AI &bull; The AI-powered workspace platform<br/>
                You received this email because you signed up at
                <a href="{settings.FRONTEND_URL}" style="color:{_TEXT_MID}; text-decoration:none;">nexusone.ai</a>
              </p>
              <p style="font-size:11px; color:{_TEXT_LIGHT}; margin:8px 0 0 0;">
                &copy; 2026 NexusOne AI. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _welcome_html(name: str) -> str:
    first = name.split()[0] if name else "there"
    cta_url = settings.FRONTEND_URL

    body = f"""
      <!-- ── Hero gradient bar ── -->
      <tr>
        <td style="background:linear-gradient(135deg,{_BRAND_COLOR} 0%,{_BRAND_DARK} 100%);
                   height:6px; font-size:0; line-height:0;">&nbsp;</td>
      </tr>

      <!-- ── Main content ── -->
      <tr>
        <td class="email-body" style="padding:48px 48px 40px;">

          <!-- Greeting icon -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td style="background:linear-gradient(135deg,{_BRAND_COLOR}22 0%,{_BRAND_DARK}22 100%);
                          border-radius:16px; padding:16px; display:inline-block;">
                <span style="font-size:36px; line-height:1;">🚀</span>
              </td>
            </tr>
          </table>

          <h1 style="font-size:28px; font-weight:700; color:{_TEXT_DARK};
                     letter-spacing:-0.5px; line-height:1.2; margin:0 0 12px;">
            Welcome, {first}!
          </h1>
          <p style="font-size:16px; color:{_TEXT_MID}; line-height:1.6; margin:0 0 32px;">
            Your NexusOne AI account is ready. You now have access to an AI-powered
            workspace that combines intelligent automation, team collaboration,
            and real-time analytics — all in one platform.
          </p>

          <!-- ── Feature grid ── -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="margin-bottom:36px;">
            <tr>
              <td width="50%" style="padding:0 8px 16px 0; vertical-align:top;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="background:#f9fafb; border-radius:12px; padding:20px;
                                border:1px solid {_BORDER};">
                      <div style="font-size:22px; margin-bottom:10px;">🤖</div>
                      <div style="font-size:14px; font-weight:600; color:{_TEXT_DARK};
                                  margin-bottom:6px;">AI Workflows</div>
                      <div style="font-size:13px; color:{_TEXT_MID}; line-height:1.5;">
                        Build intelligent automation pipelines with no-code AI agents.
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
              <td width="50%" style="padding:0 0 16px 8px; vertical-align:top;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="background:#f9fafb; border-radius:12px; padding:20px;
                                border:1px solid {_BORDER};">
                      <div style="font-size:22px; margin-bottom:10px;">👥</div>
                      <div style="font-size:14px; font-weight:600; color:{_TEXT_DARK};
                                  margin-bottom:6px;">Team Orgs</div>
                      <div style="font-size:13px; color:{_TEXT_MID}; line-height:1.5;">
                        Multi-tenant workspaces with role-based access control.
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding:0 8px 0 0; vertical-align:top;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="background:#f9fafb; border-radius:12px; padding:20px;
                                border:1px solid {_BORDER};">
                      <div style="font-size:22px; margin-bottom:10px;">📊</div>
                      <div style="font-size:14px; font-weight:600; color:{_TEXT_DARK};
                                  margin-bottom:6px;">Analytics</div>
                      <div style="font-size:13px; color:{_TEXT_MID}; line-height:1.5;">
                        Real-time insights across all your projects and teams.
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
              <td width="50%" style="padding:0 0 0 8px; vertical-align:top;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="background:#f9fafb; border-radius:12px; padding:20px;
                                border:1px solid {_BORDER};">
                      <div style="font-size:22px; margin-bottom:10px;">🔍</div>
                      <div style="font-size:14px; font-weight:600; color:{_TEXT_DARK};
                                  margin-bottom:6px;">Smart Search</div>
                      <div style="font-size:13px; color:{_TEXT_MID}; line-height:1.5;">
                        Semantic search across your knowledge base and docs.
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- ── CTA button ── -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr>
              <td style="border-radius:10px;
                          background:linear-gradient(135deg,{_BRAND_COLOR} 0%,{_BRAND_DARK} 100%);
                          box-shadow:0 4px 14px rgba(99,102,241,0.4);">
                <a class="btn" href="{cta_url}"
                   style="display:inline-block; padding:14px 36px; font-size:15px;
                          font-weight:600; color:#ffffff; text-decoration:none;
                          letter-spacing:0.1px; white-space:nowrap; border-radius:10px;">
                  Open NexusOne AI &rarr;
                </a>
              </td>
            </tr>
          </table>

          <!-- ── Divider ── -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="margin-bottom:24px;">
            <tr>
              <td style="border-top:1px solid {_BORDER}; font-size:0; line-height:0;">&nbsp;</td>
            </tr>
          </table>

          <p style="font-size:13px; color:{_TEXT_LIGHT}; line-height:1.6; margin:0;">
            Need help getting started? Reply to this email or visit our
            <a href="{cta_url}/docs" style="color:{_BRAND_COLOR}; text-decoration:none; font-weight:500;">
              documentation</a>.
            We&apos;re here for you.
          </p>

        </td>
      </tr>
    """

    return _base_html(
        title="Welcome to NexusOne AI",
        preview=f"Your account is ready, {first}. Start building AI-powered workflows today.",
        body_html=f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{body}</table>',
    )


def _invitation_html(org_name: str, token: str, org_slug: str = "") -> str:
    if org_slug:
        from urllib.parse import urlparse
        parsed = urlparse(settings.FRONTEND_URL)
        link = f"{parsed.scheme}://{org_slug}.{parsed.netloc}/invitations/{token}/accept"
    else:
        link = f"{settings.FRONTEND_URL}/invitations/{token}/accept"

    body = f"""
      <!-- ── Hero gradient bar ── -->
      <tr>
        <td style="background:linear-gradient(135deg,{_BRAND_COLOR} 0%,{_BRAND_DARK} 100%);
                   height:6px; font-size:0; line-height:0;">&nbsp;</td>
      </tr>

      <!-- ── Main content ── -->
      <tr>
        <td class="email-body" style="padding:48px 48px 40px;">

          <!-- Icon -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td style="background:linear-gradient(135deg,{_BRAND_COLOR}22 0%,{_BRAND_DARK}22 100%);
                          border-radius:16px; padding:16px; display:inline-block;">
                <span style="font-size:36px; line-height:1;">✉️</span>
              </td>
            </tr>
          </table>

          <h1 style="font-size:28px; font-weight:700; color:{_TEXT_DARK};
                     letter-spacing:-0.5px; line-height:1.2; margin:0 0 12px;">
            You've been invited!
          </h1>
          <p style="font-size:16px; color:{_TEXT_MID}; line-height:1.6; margin:0 0 8px;">
            You have been invited to join
          </p>
          <p style="font-size:20px; font-weight:600; color:{_TEXT_DARK}; margin:0 0 28px;">
            {org_name}
          </p>
          <p style="font-size:14px; color:{_TEXT_MID}; line-height:1.6; margin:0 0 32px;">
            Click the button below to accept your invitation and start collaborating
            with your team on NexusOne AI. This invitation expires in
            <strong style="color:{_TEXT_DARK};">72 hours</strong>.
          </p>

          <!-- ── CTA button ── -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr>
              <td style="border-radius:10px;
                          background:linear-gradient(135deg,{_BRAND_COLOR} 0%,{_BRAND_DARK} 100%);
                          box-shadow:0 4px 14px rgba(99,102,241,0.4);">
                <a class="btn" href="{link}"
                   style="display:inline-block; padding:14px 36px; font-size:15px;
                          font-weight:600; color:#ffffff; text-decoration:none;
                          letter-spacing:0.1px; white-space:nowrap; border-radius:10px;">
                  Accept Invitation &rarr;
                </a>
              </td>
            </tr>
          </table>

          <!-- ── Fallback link ── -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="background:#f9fafb; border-radius:10px; margin-bottom:32px;">
            <tr>
              <td style="padding:16px 20px;">
                <p style="font-size:12px; color:{_TEXT_MID}; margin:0 0 6px;">
                  Or copy this link into your browser:
                </p>
                <p style="font-size:12px; color:{_BRAND_COLOR}; word-break:break-all; margin:0;">
                  {link}
                </p>
              </td>
            </tr>
          </table>

          <!-- ── Divider ── -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="margin-bottom:24px;">
            <tr>
              <td style="border-top:1px solid {_BORDER}; font-size:0; line-height:0;">&nbsp;</td>
            </tr>
          </table>

          <p style="font-size:13px; color:{_TEXT_LIGHT}; line-height:1.6; margin:0;">
            If you weren&apos;t expecting this invitation, you can safely ignore this email.
          </p>

        </td>
      </tr>
    """

    return _base_html(
        title=f"Invitation to join {org_name} on NexusOne AI",
        preview=f"You've been invited to join {org_name} on NexusOne AI. Accept your invitation now.",
        body_html=f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{body}</table>',
    )


def _removal_html(org_name: str, reason: str) -> str:
    body = f"""
      <tr>
        <td style="background:linear-gradient(135deg,#ef4444 0%,#dc2626 100%);
                   height:6px; font-size:0; line-height:0;">&nbsp;</td>
      </tr>
      <tr>
        <td class="email-body" style="padding:48px 48px 40px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td style="background:#fee2e222; border-radius:16px; padding:16px; display:inline-block;">
                <span style="font-size:36px; line-height:1;">🔔</span>
              </td>
            </tr>
          </table>
          <h1 style="font-size:28px; font-weight:700; color:{_TEXT_DARK};
                     letter-spacing:-0.5px; line-height:1.2; margin:0 0 12px;">
            Your access has been removed
          </h1>
          <p style="font-size:16px; color:{_TEXT_MID}; line-height:1.6; margin:0 0 24px;">
            Your membership in <strong style="color:{_TEXT_DARK};">{org_name}</strong> on NexusOne AI
            has been removed by the organization owner.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td style="background:#fef2f2; border:1px solid #fecaca; border-radius:12px; padding:20px 24px;">
                <p style="font-size:12px; font-weight:600; color:#dc2626; text-transform:uppercase;
                           letter-spacing:0.05em; margin:0 0 8px;">Reason provided</p>
                <p style="font-size:15px; color:{_TEXT_DARK}; line-height:1.6; margin:0;">{reason}</p>
              </td>
            </tr>
          </table>
          <p style="font-size:14px; color:{_TEXT_MID}; line-height:1.6; margin:0 0 8px;">
            If you believe this was done in error, please contact the organization owner directly.
          </p>
          <p style="font-size:13px; color:{_TEXT_LIGHT}; line-height:1.6; margin:0;">
            Your NexusOne AI account remains active — only your access to {org_name} has been removed.
          </p>
        </td>
      </tr>
    """
    return _base_html(
        title=f"Your access to {org_name} has been removed",
        preview=f"Your membership in {org_name} on NexusOne AI has been removed.",
        body_html=f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{body}</table>',
    )


def _mention_html(task_title: str, task_url: str, comment_content: str, author_name: str) -> str:
    body = f"""
      <!-- ── Hero gradient bar ── -->
      <tr>
        <td style="background:linear-gradient(135deg,{_BRAND_COLOR} 0%,{_BRAND_DARK} 100%);
                   height:6px; font-size:0; line-height:0;">&nbsp;</td>
      </tr>

      <!-- ── Main content ── -->
      <tr>
        <td class="email-body" style="padding:48px 48px 40px;">

          <!-- Icon -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td style="background:linear-gradient(135deg,{_BRAND_COLOR}22 0%,{_BRAND_DARK}22 100%);
                          border-radius:16px; padding:16px; display:inline-block;">
                <span style="font-size:36px; line-height:1;">💬</span>
              </td>
            </tr>
          </table>

          <h1 style="font-size:24px; font-weight:700; color:{_TEXT_DARK};
                     letter-spacing:-0.5px; line-height:1.2; margin:0 0 12px;">
            You were mentioned in a comment
          </h1>
          <p style="font-size:15px; color:{_TEXT_MID}; line-height:1.6; margin:0 0 16px;">
            <strong>{author_name}</strong> mentioned you on the task <strong style="color:{_TEXT_DARK};">{task_title}</strong>:
          </p>
          <div style="background-color:#F8FAFC; border-left:4px solid {_BRAND_COLOR}; padding:16px; border-radius:8px; font-size:14px; color:{_TEXT_DARK}; line-height:1.5; margin:0 0 28px; font-style:italic;">
            "{comment_content}"
          </div>
          
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr>
              <td style="background:{_BRAND_COLOR}; border-radius:8px;">
                <a href="{task_url}" target="_blank"
                   style="font-size:14px; font-weight:600; color:#FFFFFF; text-decoration:none;
                          padding:12px 28px; display:block; border-radius:8px;">
                  View Comment
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    """
    return _base_html(
        title="New Mention",
        preview=f"{author_name} mentioned you on task: {task_title}",
        body_html=f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{body}</table>',
    )


def _assignment_html(task_title: str, task_url: str, assigner_name: str) -> str:
    body = f"""
      <!-- ── Hero gradient bar ── -->
      <tr>
        <td style="background:linear-gradient(135deg,{_BRAND_COLOR} 0%,{_BRAND_DARK} 100%);
                   height:6px; font-size:0; line-height:0;">&nbsp;</td>
      </tr>

      <!-- ── Main content ── -->
      <tr>
        <td class="email-body" style="padding:48px 48px 40px;">

          <!-- Icon -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td style="background:linear-gradient(135deg,{_BRAND_COLOR}22 0%,{_BRAND_DARK}22 100%);
                          border-radius:16px; padding:16px; display:inline-block;">
                <span style="font-size:36px; line-height:1;">📌</span>
              </td>
            </tr>
          </table>

          <h1 style="font-size:24px; font-weight:700; color:{_TEXT_DARK};
                     letter-spacing:-0.5px; line-height:1.2; margin:0 0 12px;">
            New task assigned to you
          </h1>
          <p style="font-size:15px; color:{_TEXT_MID}; line-height:1.6; margin:0 0 28px;">
            <strong>{assigner_name}</strong> assigned the task <strong style="color:{_TEXT_DARK};">{task_title}</strong> to you.
          </p>
          
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr>
              <td style="background:{_BRAND_COLOR}; border-radius:8px;">
                <a href="{task_url}" target="_blank"
                   style="font-size:14px; font-weight:600; color:#FFFFFF; text-decoration:none;
                          padding:12px 28px; display:block; border-radius:8px;">
                  View Task
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    """
    return _base_html(
        title="Task Assigned",
        preview=f"Task assigned to you: {task_title}",
        body_html=f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{body}</table>',
    )


def _workflow_html(subject: str, message: str, action_url: str = "", action_label: str = "Open NexusOne") -> str:
    btn = ""
    if action_url:
        btn = f"""
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr>
              <td style="background:{_BRAND_COLOR}; border-radius:8px;">
                <a href="{action_url}" target="_blank"
                   style="font-size:14px; font-weight:600; color:#FFFFFF; text-decoration:none;
                          padding:12px 28px; display:block; border-radius:8px;">
                  {action_label}
                </a>
              </td>
            </tr>
          </table>"""
    body = f"""
      <tr>
        <td style="background:linear-gradient(135deg,{_BRAND_COLOR} 0%,{_BRAND_DARK} 100%);
                   height:6px; font-size:0; line-height:0;">&nbsp;</td>
      </tr>
      <tr>
        <td class="email-body" style="padding:48px 48px 40px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td style="background:linear-gradient(135deg,{_BRAND_COLOR}22 0%,{_BRAND_DARK}22 100%);
                          border-radius:16px; padding:16px; display:inline-block;">
                <span style="font-size:36px; line-height:1;">⚡</span>
              </td>
            </tr>
          </table>
          <h1 style="font-size:24px; font-weight:700; color:{_TEXT_DARK};
                     letter-spacing:-0.5px; line-height:1.2; margin:0 0 12px;">
            {subject}
          </h1>
          <p style="font-size:15px; color:{_TEXT_MID}; line-height:1.6; margin:0 0 28px;">
            {message}
          </p>
          {btn}
        </td>
      </tr>
    """
    return _base_html(
        title=subject,
        preview=message[:100],
        body_html=f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{body}</table>',
    )


async def send_email(to: str, subject: str, html_body: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"NexusOne AI <{settings.SMTP_FROM}>"
    msg["To"] = to
    msg.attach(MIMEText(html_body, "html"))
    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            use_tls=settings.SMTP_TLS,
        )
        logger.info("Email sent to=%s subject=%s", to, subject)
    except Exception:
        # Notifications are best-effort — log but don't crash the event loop
        logger.exception("Failed to send email to=%s subject=%s", to, subject)
