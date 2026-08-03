// ── Shared branded email layout ─────────────────────────────────────────────
// Every system email renders through renderBrandedEmail so branding (org
// banner, wrapper, footer) lives in one place. Senders only supply content
// options; the markup/styles are not duplicated per email.

const BANNER_URL =
  "https://res.cloudinary.com/dvn0iyh3v/image/upload/v1785742286/SDO_Office-1_dyowlt.png";

const CTA_COLOR = "#0078D4";
const TEXT_PRIMARY = "#111827";
const TEXT_BODY = "#374151";
const TEXT_MUTED = "#6B7280";

// ── Social links ───────────────────────────────────────────────────────────

const SOCIALS: { name: string; href: string; color: string; mark: string }[] = [
  { name: "Facebook", href: "https://www.facebook.com/MicrosoftStudentCommunityQCU", color: "#1877F2", mark: "f" },
  { name: "Instagram", href: "https://www.instagram.com/mscqcu/", color: "#E4405F", mark: "Ig" },
  { name: "LinkedIn", href: "https://www.linkedin.com/company/microsoft-student-community-quezon-city-university", color: "#0A66C2", mark: "in" },
  { name: "TikTok", href: "https://www.tiktok.com/@mscqcu", color: "#010101", mark: "&#9834;" },
];

// ── Exports ─────────────────────────────────────────────────────────────────

export interface EmailButton {
  href: string;
  label: string;
}

/** Optional content blocks accepted by the branded template. */
export interface BrandedEmailOptions {
  headline: string;
  greeting?: string;
  paragraphs?: string[];
  /** Bulleted list block with an optional intro label. */
  bullets?: { label?: string; items: string[] };
  /** Highlighted admin message (e.g. rejection reason). */
  note?: string;
  button?: EmailButton;
  /** Large-print payload block (e.g. QR ticket code). */
  qrPayload?: string;
  /** Small footer note (e.g. expiry warning). */
  expiryNote?: string;
  /** Append the standard "contact the administrators" line. */
  supportLine?: boolean;
}

/**
 * Escape a dynamic string so user/admin-provided text cannot inject HTML.
 * Use around any value that originates from the database or request body.
 */
export function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return esc(value).replace(/"/g, "&quot;");
}

// ── Section builders ────────────────────────────────────────────────────────

function blockQuote(note?: string): string {
  if (!note) return "";
  return `<p style="margin:0 0 16px;background:#F3F4F6;border-left:4px solid ${CTA_COLOR};padding:12px 16px;font-size:14px;line-height:1.6;color:${TEXT_BODY};border-radius:0 6px 6px 0;"><strong style="color:${TEXT_PRIMARY}">Note from the admin:</strong><br/>${esc(note)}</p>`;
}

function buttonBlock(button?: EmailButton): string {
  if (!button) return "";
  return `<p style="margin:24px 0 8px;"><a href="${escapeAttribute(button.href)}" style="display:inline-block;padding:13px 28px;background:${CTA_COLOR};color:#FFFFFF;text-decoration:none;border-radius:8px;font-weight:600;letter-spacing:0.3px;font-size:15px;">${esc(button.label)}</a></p>`;
}

function qrBlock(payload?: string): string {
  if (!payload) return "";
  return `<div style="margin:16px 0;padding:16px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;text-align:center;"><p style="margin:0 0 6px;font-size:12px;color:${TEXT_MUTED};letter-spacing:0.5px;text-transform:uppercase;">Your entry pass</p><p style="margin:0;font-size:26px;font-weight:700;letter-spacing:3px;color:${TEXT_PRIMARY};">${esc(payload)}</p></div>`;
}

function socialRow(): string {
  const chips = SOCIALS.map(
    (s) =>
      '<a href="' +
      escapeAttribute(s.href) +
      '" target="_blank" rel="noopener" title="' +
      esc(s.name) +
      '" aria-label="' +
      esc(s.name) +
      '" style="display:inline-block;width:34px;height:34px;line-height:34px;border-radius:50%;background:' +
      s.color +
      ';color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;text-align:center;text-decoration:none;margin:0 6px;">' +
      s.mark +
      "</a>"
  ).join("");

  return `
    <p style="margin:0 0 16px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${TEXT_MUTED};">Follow us</p>
    <div style="text-align:center;margin-bottom:22px;">${chips}</div>
    <p style="margin:0 0 4px;font-size:13px;color:${TEXT_BODY};">Questions? Reach us at</p>
    <p style="margin:0 0 20px;"><a href="mailto:msc-qcu@outlook.com" style="color:${CTA_COLOR};text-decoration:none;font-weight:600;">msc-qcu@outlook.com</a></p>
    <p style="margin:0 0 4px;font-size:12px;color:${TEXT_MUTED};">You received this email because you are part of the QCU Microsoft Student Community.</p>
    <p style="margin:0;font-size:12px;color:${TEXT_MUTED};">&copy; ${new Date().getFullYear()} Microsoft Student Community &middot; Quezon City University</p>`;
}
function contents(options: BrandedEmailOptions): string {
  const blocks = [
    `<h2 style="margin:0 0 12px;font-size:20px;line-height:1.35;color:${TEXT_PRIMARY};">${esc(options.headline)}</h2>`,
    options.greeting
      ? `<p style="margin:0 0 16px;font-size:15px;color:${TEXT_PRIMARY};"><strong>${esc(options.greeting)}</strong></p>`
      : "",
    (options.paragraphs ?? [])
      .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:${TEXT_BODY};">${p}</p>`)
      .join("\n"),
    options.bullets
      ? `<p style="margin:0 0 8px;font-size:15px;color:${TEXT_BODY};">${esc(options.bullets.label ?? "Please review the following:")}</p>` +
        `<ul style="margin:0 0 16px;padding-left:20px;">${options.bullets.items.map((item) => `<li style="margin:0 0 6px;font-size:14px;color:${TEXT_BODY};">${esc(item)}</li>`).join("")}</ul>`
      : "",
    blockQuote(options.note),
    buttonBlock(options.button),
    qrBlock(options.qrPayload),
    options.expiryNote
      ? `<p style="margin:16px 0 0;font-size:12px;color:${TEXT_MUTED};">${esc(options.expiryNote)}</p>`
      : "",
    options.supportLine
      ? `<p style="margin:16px 0 0;font-size:12px;color:${TEXT_MUTED};">If you believe this is a mistake, please contact the Microsoft Student Community administrators.</p>`
      : "",
  ];

  return blocks.filter(Boolean).join("\n");
}

/**
 * Render a full branded HTML email document from content options.
 * All branding (banner, wrapper, footer) is defined here — senders only pick
 * which optional content blocks to include.
 */
export function renderBrandedEmail(options: BrandedEmailOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#F3F4F6;line-height:1px;opacity:0;">You have a new update from Microsoft Student Community &mdash; QCU</div>
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0 auto;padding:32px 16px;max-width:600px;">
    <div style="background-color:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <div style="line-height:0;text-align:center;">
        <img src="${BANNER_URL}" alt="Microsoft Student Community" width="600" height="150" style="display:block;width:100%;max-width:600px;height:auto;border:0;line-height:0;" />
      </div>
      <div style="padding:28px 32px 24px;">
        ${contents(options)}
      </div>
      <div style="padding:24px 32px;background-color:#F9FAFB;border-top:1px solid #E5E7EB;">
        ${socialRow()}
      </div>
    </div>
    <p style="margin:16px 0 0;text-align:center;font-size:11px;color:#9CA3AF;">You are receiving this email because you engaged with the QCU Microsoft Student Community portal.</p>
  </div>
</body>
</html>`;
}