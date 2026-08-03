// ── Shared branded email layout ─────────────────────────────────────────────
// Every system email renders through renderBrandedEmail so branding (org
// banner, wrapper, footer) lives in one place. Senders only supply content
// options; the markup/styles are not duplicated per email.

const BANNER_URL =
  "https://res.cloudinary.com/dvn0iyh3v/image/upload/v1785742286/SDO_Office-1_dyowlt.png";

const CTA_COLOR = "#0078D4";

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

function blockQuote(note?: string): string {
  if (!note) return "";
  return `<p style="margin:0 0 12px;background:#f0f0f0;padding:12px;border-left:4px solid ${CTA_COLOR};"><strong>Note from the admin:</strong> ${esc(note)}</p>`;
}

function buttonBlock(button?: EmailButton): string {
  if (!button) return "";
  return `<p style="margin:0 0 12px;"><a href="${escapeAttribute(button.href)}" style="display:inline-block;padding:12px 24px;background:${CTA_COLOR};color:#fff;text-decoration:none;border-radius:4px;">${esc(button.label)}</a></p>`;
}

function qrBlock(payload?: string): string {
  if (!payload) return "";
  return `<p style="margin:0 0 12px;font-size:24px;font-weight:bold;letter-spacing:2px;background:#f0f0f0;padding:12px;text-align:center;">${esc(payload)}</p>`;
}

/**
 * Assemble every content block for the body, skipping empty optional sections.
 */
function contents(options: BrandedEmailOptions): string {
  const blocks = [
    `<h2 style="margin:0 0 8px;color:#333;">${esc(options.headline)}</h2>`,
    options.greeting
      ? `<p style="margin:0 0 12px;"><strong>${esc(options.greeting)}</strong></p>`
      : "",
    (options.paragraphs ?? [])
      .map((p) => `<p style="margin:0 0 12px;line-height:1.6;">${p}</p>`)
      .join("\n"),
    options.bullets
      ? `<p style="margin:0 0 8px;">${esc(options.bullets.label ?? "Please review the following:")}</p>` +
        `<ul>${options.bullets.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`
      : "",
    blockQuote(options.note),
    buttonBlock(options.button),
    qrBlock(options.qrPayload),
    options.expiryNote
      ? `<p style="color:#666;font-size:12px;margin:0;">${esc(options.expiryNote)}</p>`
      : "",
    options.supportLine
      ? `<p style="color:#666;font-size:12px;margin:0;">If you believe this is a mistake, please contact the Microsoft Student Community administrators.</p>`
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
</head>
<body style="font-family: Arial, sans-serif; margin: 0; padding: 24px 12px; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
    <div style="text-align: center;">
      <img src="${BANNER_URL}" alt="Microsoft Student Community" width="600" height="150" style="display: block; width: 100%; max-width: 600px; height: auto; border: 0;" />
    </div>
    <div style="padding: 24px;">
      ${contents(options)}
    </div>
    <div style="padding: 16px 24px; background-color: #f5f5f5; font-size: 12px; color: #666; border-top: 1px solid #e5e5e5;">
      Microsoft Student Community &middot; QCU &middot; &copy; ${new Date().getFullYear()}
    </div>
  </div>
</body>
</html>`;
}