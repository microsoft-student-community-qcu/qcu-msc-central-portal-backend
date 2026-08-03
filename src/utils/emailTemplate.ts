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

const SOCIALS: { name: string; href: string; icon: string }[] = [
  { name: "Facebook", href: "https://www.facebook.com/MicrosoftStudentCommunityQCU", icon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAsCAYAAAAehFoBAAAACXBIWXMAAAsTAAALEwEAmpwYAAADa0lEQVRYhdWZXahUVRTH9zU/Qn2QBPHZl/IlIQTRQkp8EZGI0MeCxMmz1lzmrHVuIj34X+dCmgiaTyVCQl+ISliRSi8h+qgifhEhhhaiCSE9mHqvFvvc8HLnzsfZd/Y444INw5k5e/32//zXZp81znUYVcVLnKHCantJcIwFZ1jxSzEEZ4prxXe2aXNt+EXXi0hqw4tJbCcLbrDavyGD1K6z2A6/0K6DcoqlJPYdKx6HgvKk4efAUU7xSnRQEbxAYvtJ7FHnoDZRcbFHJLbP54gCS1m+jNV+iw3Kk8F/J8VrncGKbSKxkW7D8jj0SFVs45Rgq4otcbxqwd4msQ9ClX3/6YNandqollM2xWpWjEZLrLjPikssdpIUp4vPij/GrrdUejSR/I3Wyg5hISluRfLjz0mWr61UMLtRLgDTqlm+pg30zc0ZFrSwAg5GAH3gLVV2X+d2cwq+amyFDKsiWeC9MrClgX0RZljp6oPFTnUOjO9dQHAp4DF7TbixmuavxlA3UazoBjD7UcuXP7mRFJ93DCx2xzk30AowGcLL3jLF6c4PsY8CamN/Mcm7wPMs+DuCwj+2VFPxWWeC4C6Amc7vdTHswGIHmsJmeD1GjqL4SC2PMpngk6bAgm1xRME2799vowCr7WkGTGp7Ij3Fw95bl54VYFJc8PvvnWcFmMVuu/aHkP4BJsU9F35Ax8MkxaL6wbx9ftOi4+3zG91Dap+G5vYVfDdolWIPXKQgxZEwS+Avf0K72itgFrsYlhu/euCfegEMYBqL/RPo4+PeErt7AZx434cWndgux5K/3Qvgatu3jQa50/zNokniqy+gUkdJ8XH9SNJ8XXM183X1v/ePN1SoWg3ziglJcCJ0tU97HybBsfEJU2zod2CW/K0nEwKYXnQV+xSYBNfWrz/03MQiENvYr8CJ4J1Jk/oVkOJ8vwGT2tlJ6o6rPLwkbMfoLjD5c067/jErhvoFmAWpKxEDvtvSc2DBF65sVCr7ZpDYD70DxlG/c7mQ8K/UIUrHAia1L71gbooxQIoPyxzyOwUmsRFSbG3XjCkVY60sXOkWMIldntCKihGDg3tn+R2EFH9GAxa7zQotOjrdCiLMJbWEBOemCkxqZ30POct2zekaaKP4/xA+yIJvvPrNfjf2ZOxr/7+Fv6eTnP8BBeiDeVwGALgAAAAASUVORK5CYII=" },
  { name: "Instagram", href: "https://www.instagram.com/mscqcu/", icon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAsCAYAAAAehFoBAAAACXBIWXMAAAsTAAALEwEAmpwYAAAFKUlEQVRYhcVZWYhcRRR9LRoFxQXj8qGCzmjABQQRRTSKJCAuHxE1/vlhpjN9q19333rjgj+3Xg9JhIggOMaI4pef0ZhkjERiPv3QaAKKRpCZGGQkIXFJjI5LlPteT0+9+/YX032hoOlXy6lb5y51y3FypKEnrwY0axXSa4Bmu0KzX2nzXdDQHFFIx/pNm+NKm39FOx7pw2MWx+8P5wzmXstrORWl1uj4j4A2nyQAOKMNgjXpYcZQCOm4R5cDmj2DBqokcDR7GEse2JtBm4OlF4gcedhA0x//g7YPMqZ0zSaBRfoZNL3Z1GZ1w+veVte0tBLJHMdpPL/hEru5Ht0ISA8AUlNpM600/Zmw/mySpmtxGtAppemldpsurgqwrDQ6dB1oejeubfo40pFJLsE20TztDEdqCs0GCbrh+Q/1e0hvAGg2DgpdXdNShf6qcaQ7Begt0nsEX9xn6arw+BcNyHXpwkGAbXj+7aDN0cW1zdsL35re5LVRTtMpxuoEQSGq3c3OgAS0+SjmGTz/joXvCmmHwDbGgzZFuUKPVgXguq+cO97uLgOPlnMbb3eX8X+pgNF8FfcK/qo+YG1c8X0qtguF3VvKgCSisxTSk4DmfdB0MsGf/qY0bYUOPcF9I4A1rRc8PWq7TXZ5QsPbnV5u0P+zDH9B091Kmy+KRy/6vKHpLvtEQtD0JSDtYj9vz89+Oroh2sdqn7F28FdRsMqjeqKjzw+580rTmiJrtFrrrhDjZ5hHhywr/b042DRQ9E0Ytcw0oDmQ0S8XtFLrLxWbPcSUmLOO7EQxGkQ1yyfDKSJHKtnfnZgcYcMO+ghN2/RIkvpzL14UtS8zxwAOW6T/JdfABGdBm5+aHt2ft9Fmh1ZwXzF2rzREWzxv4/mCw4edXuLdDxqZi2qzWmq2CNgIaKHppvYfd1LkKaLzohqmY07kloDmiJMhStM2YfWvZvVPEqXpdbHp9zJO9GwB+FfH9p2g6ces3Uo/m8TZPHEnJkekn84ILjVBiZPsJeat3f6QtpDSdIPQzNdORQHhPQBpNGPdv21DdezEhxP41IEe3ScW+aAqYKXNzshJoX9v6uasmwug+ScCWCF9nzaQJxVHubMqYED6MLJ5j5YXBlyVEhwghkIJKGF0YSJj5R0TkyPlwdKoAHuilNGVdGtbhePfVBaw0vSGiF5b0vrW65vPibm1MoGDU8RY4OjQiuJg/ZX2Eff4+1ipwFE2NHOKGAvNBUAr7a9MCM2fZlV4AOiChNC8mPwwR/MW5oTFNtQFTXMES+I0II3ytSumWTTz4uIZEy4xCPrMRdJLdiF5gEMQZky4OBvIAfbR7PYA6du0fkXKCMGNOpZeVk3gNa2Rmi7SAM180ZoHTNCVYvxM7IrEJaSioAN6aLO3MGCkz/JoYAvX1QSH98Wv0m261SkhbIicInLWJf206vlZLj/1vEGxEmp6RWpb7JrPOW+ZSQX4Ja1nutdzqG12/Hv4N/9XdT5A4wkFTMXvZ1b1ZdgCSLsE/8dipSo+wtxC8gCkxSclbietFl0T7kQ+DaB5a5hgKbw7TicWA5PJHVjkC0PCW1NIL2eWW5ML2sGu3ukfwwAEgkwuem/scXd34SeDIDgg7QCkFiA9yOUjWfov4gmIaIk9hosk0OnexHMqbdphZIxytue7Z1133WXpjhpptmz0ijfOG6ybjK7YwveN5EeZBeHd8JvC6YM+vQZodqdqNknYEIf1sNgQBlZK2E/3srOpM/V0ywUZXiN4EsiR/wBNAmcrbmuCHAAAAABJRU5ErkJggg==" },
  { name: "LinkedIn", href: "https://www.linkedin.com/company/microsoft-student-community-quezon-city-university", icon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAsCAYAAAAehFoBAAAACXBIWXMAAAsTAAALEwEAmpwYAAACKElEQVRYhe2Zv2sUURDHXxRUtLBQ0dbCH/+BhdpooTZpJNgIdoeZ2b3czCrafWcvJgYkiJ1apbCyUgNJaaO1hYW/S8FKRASRaCJ7J3KEfbdLSHgvYQe+sLCzsx+G2e/b3ecAbGNBhwTvWbHMaitxCcsk9o7VUufciGOFhoeyehJ0HKt9Cg6itfXBxTkG5h0PFweI1dbWAqa+c4y221MHr050j7HYbRJbihKYxN5k2Z09blWw5BejBGbNzzlPkGAhOuBWC7u9wIqb0QGn6dSBIR2+FR0wF6tKSaTpvZ2seBsdMAl+JJ385CAsgB2seBgKlqt9GL9JMUdq4725FXsdEpa33MLBEcp5T4q9JMVMqcR+DeaS2IOyPFZ79e/8HxJ7SoLzrRsze4vnobDNJJs8nAgus+LZenR40mdrLPg+mNu+3j1Smqe4T4ovSSc/7SoiyfILLPgaFJjEZhPF8SrY//man616V9nYDvP0vrqwA7UfBQNeS1CWn4gCmBVHkwxnqnLHxh5vHzbLGw5M13CIFC9Wucr8FWCX9xqx58GAWfGkvD7UC6yYCwLcUuwvPNhTf9EPbHfD2JrilK8+iX0e0uHpMLamGPXWF3wbUr8bBDhRu+QHtp8NsGs6bM1IrDQPnTYuYY0Ph1k4ZD0+QuF5U+tds+SrX9x7LUtzlHKbEBiba1OGBB/Dg1gtFVsYjjKT0CBcXxOFi4wUB/3t0fjGo/+J1fsfzQXrX6h0yTxHtiveAAAAAElFTkSuQmCC" },
  { name: "TikTok", href: "https://www.tiktok.com/@mscqcu", icon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAsCAYAAAAehFoBAAAACXBIWXMAAAsTAAALEwEAmpwYAAADL0lEQVRYhe2ZSWhUQRCGO4rgvosSl4N48iDEi3jXg55EDS4IkYATp/q9mamaLF6karIHF7woBMSANwVPgphTvHjwIqIXFVdcLuISxUOiJNLPEIc48/q9mfcmM+IPfXtd/U11V3V1jVIxCfHcAkAZ0ySThYZLnQ2qmpTNnllUDNaMZJb3q1oCBuJeVU0C4MV+wBrlkaopYJJJyOZ2qGpRc9vAEhuwJhlWNQY8CSgtqsaAxzTlds82r3JdXhoEeAr6h0bpqBlgPZ3q5B4g71VK1dUEsP7j8Tca+ZJGPpxs5W3MPCd24ERH/7JSgf+6Falr43/gmUqnefk/BQw+lVxVAmuUDiA5rUm+xwpsItZELqCcAJIcEPcDcrfOSFP+d8lTfSv8gTljvoNWXqeRzwPJ50iBzSRNfBZQ3hU2zO9DAZOkZxb8DskhjTIEyC808URJwIkELwSUAfuZ47flABeq9sxOOhneZRhUEAHyFlO3Bkr2JK/z5yLySv+g45SKUga2+PYXHC/z52vdu8ryvRsZrNvOG4zHQubL57MGDMi3QsKaLX4aBhiQnUhgHeRjYWGngu5xvp0E8epKANcZTwX06DNAGTQXgCbp0iQXwwBrEl02rUkhVljkL+aSaGy8PtfPVkWAgfiKDdbkxiC2XLdnjZ+tJDJEAfzQ9xgQHw9sy1y5FCNwE/N8721V3LuvbMcgX6kUb/L/8ZIsCziV6lnrH2QyGMaed0tSjMC2M6dR+kLZy/LWWPsRtmIFkC+EAqbOBn8H5A6ocuWlrOIevhvGFmT5oB9wJP1hQBkpvghPhFkEkG/7AH9LJAbnlQ3sELdbjsX9ILWpzvBJy/m9WTast1Ab12vicctiIyajFLVB4tpsOMT7IgH2FkQZ8g2W3ynpo1c/pHM7kxnerDO8HYibTavJOhflSZh8bgdu43ogGbUtXOpwsrk9kcFOQyMfjQMWiC+ruGT+NIkWmO+Y6z824KnauDsi4GHzClaVkEO5Ro3yoUSvjptmS6RBFkSmGDe9CZPwA4L+1CTXTD1RUdCZMtsKJEc08lUgfqCRP3m9MeSv3tMK5YbpN7Rg9/q4GH4BQcD4LV/4MPAAAAAASUVORK5CYII=" },
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
      '<a href="' +
      escapeAttribute(social.href) +
      '" target="_blank" rel="noopener" aria-label="' +
      esc(social.name) +
      '" style="display:inline-block;text-align:center;margin:0 6px;text-decoration:none;">' +
      '<img src="' +
      social.icon +
      '" width="26" height="26" alt="" style="display:block;width:26px;height:26px;border:0;outline:none;" />' +
      '<span style="display:block;margin-top:5px;font-size:11px;letter-spacing:0.4px;color:' +
      TEXT_MUTED +
      ';">' +
      esc(social.name) +
      '</span>' +
      "</a>"
  ).join("\n");

  return `
    <p style="margin:0 0 16px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${TEXT_MUTED};">Follow us</p>
    <div style="text-align:center;margin-bottom:22px;">${icons}</div>
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