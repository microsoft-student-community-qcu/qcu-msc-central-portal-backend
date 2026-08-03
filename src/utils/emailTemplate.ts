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

const SOCIALS: { name: string; href: string; svg: string }[] = [
  {
    name: "Facebook",
    href: "https://www.facebook.com/MicrosoftStudentCommunityQCU",
    svg: '<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>',
  },
  {
    name: "Instagram",
    href: "https://www.instagram.com/mscqcu/",
    svg: '<path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/>',
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/company/microsoft-student-community-quezon-city-university",
    svg: '<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>',
  },
  {
    name: "TikTok",
    href: "https://www.tiktok.com/@mscqcu",
    svg: '<path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>',
  },
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
  const icons = SOCIALS.map(
    (social) =>
      `<a href="${escapeAttribute(social.href)}" target="_blank" rel="noopener" style="display:inline-block;margin:0 10px;text-decoration:none;" aria-label="${esc(social.name)}">` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="${TEXT_MUTED}" style="display:block;vertical-align:middle;">${social.svg}</svg>` +
      `</a>`
  ).join("\n");

  return `
    <p style="margin:0 0 16px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${TEXT_MUTED};">Follow us</p>
    <div style="margin-bottom:20px;">${icons}</div>
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