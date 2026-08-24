/**
 * Email-render suite (V2 Module 04). Verifies the merch email COPY/HTML that the
 * HTTP suite can't (emails send to a real inbox in a live run). It cancels the
 * global email.service mock for THIS file and captures the HTML handed to the
 * provider, plus unit-tests the pure copy helpers.
 *
 * Proves the reported fixes:
 *  - dynamic per-reason rejection headline/subject (not the static
 *    "We couldn't verify your payment");
 *  - system Reason block kept separate from the admin's Note;
 *  - AMOUNT_MISMATCH states the exact ₱ top-up + shows the GCash QR;
 *  - refund email renders a human method label ("Maya"), never the raw enum;
 *  - the sold-out email has NO "Resubmit" button and offers swap + refund CTAs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Cancel the global setup mock so the REAL builders run in this file.
vi.unmock("../services/email.service");

// Capture the HTML/subject handed to the Resend transport. `sent` is created via
// vi.hoisted so the (hoisted) vi.mock factory can safely reference it.
const { sent } = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; html: string }[] }));
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (o: any) => {
        sent.push({ to: o.to, subject: o.subject, html: o.html });
        return { data: { id: "test" }, error: null };
      },
    };
  },
}));

import {
  sendMerchOrderRejectedEmail,
  sendMerchOutOfStockEmail,
  sendMerchRefundProcessedEmail,
  rejectedEmailCopy,
  REFUND_METHOD_LABELS,
} from "../services/email.service";

const OLD_STATIC_HEADLINE = "We couldn't verify your payment";

beforeEach(() => {
  sent.length = 0;
});

// ── Pure copy helpers ────────────────────────────────────────────────────────
describe("rejectedEmailCopy — dynamic per-reason copy", () => {
  const base = { studentName: "Jane", orderRef: "MSC-MERCH-2026-0001", reasonLabel: "x", trackingUrl: "http://t" };

  it("gives each reason a distinct, non-static headline + subject", () => {
    const reasons = ["REFERENCE_NOT_FOUND", "AMOUNT_MISMATCH", "SCREENSHOT_UNCLEAR", "OTHER"] as const;
    const headlines = new Set<string>();
    for (const reason of reasons) {
      const c = rejectedEmailCopy({ ...base, reason } as any);
      expect(c.headline, `${reason} headline not static`).to.not.eql(OLD_STATIC_HEADLINE);
      headlines.add(c.headline);
    }
    expect(headlines.size, "headlines are distinct per reason").to.eql(reasons.length);
  });

  it("AMOUNT_MISMATCH copy states the exact top-up + a top-up CTA", () => {
    const c = rejectedEmailCopy({ ...base, reason: "AMOUNT_MISMATCH", shortfall: { amount: 100 } } as any);
    expect(c.intro).to.include("₱100.00");
    expect(c.cta).to.match(/top-?up/i);
    expect(c.subject).to.match(/incomplete/i);
  });

  it("REFERENCE_NOT_FOUND uses a resubmit CTA", () => {
    const c = rejectedEmailCopy({ ...base, reason: "REFERENCE_NOT_FOUND" } as any);
    expect(c.cta).to.match(/resubmit/i);
    expect(c.headline).to.match(/couldn't find/i);
  });
});

describe("REFUND_METHOD_LABELS — human labels, never the raw enum", () => {
  it("maps every method to a friendly label", () => {
    expect(REFUND_METHOD_LABELS.GCASH).to.eql("GCash");
    expect(REFUND_METHOD_LABELS.MAYA).to.eql("Maya");
    expect(REFUND_METHOD_LABELS.MARIBANK).to.eql("Maribank");
    expect(REFUND_METHOD_LABELS.CASH).to.eql("cash");
    expect(REFUND_METHOD_LABELS.OTHER).to.eql("another arrangement");
  });
});

// ── Rendered HTML (captured from the transport) ──────────────────────────────
describe("rejection email HTML", () => {
  it("AMOUNT_MISMATCH: exact ₱, QR, distinct Reason + admin Note, top-up CTA, no static headline", async () => {
    const ok = await sendMerchOrderRejectedEmail("jane@example.com", {
      studentName: "Jane",
      orderRef: "MSC-MERCH-2026-0001",
      reason: "AMOUNT_MISMATCH",
      reasonLabel: "Amount received does not match the order total",
      financeNote: "Please send the remaining balance, salamat!",
      trackingUrl: "http://localhost:5173/merch/orders/MSC-MERCH-2026-0001",
      shortfall: { amount: 100, gcashNumber: "09171234567", gcashQrImageUrl: "https://cdn/qr.png" },
    });
    expect(ok).to.eql(true);
    const { subject, html } = sent[0];
    expect(subject).to.match(/incomplete/i);
    expect(html).to.not.include(OLD_STATIC_HEADLINE);
    expect(html).to.include("₱100.00");
    expect(html).to.include("https://cdn/qr.png"); // QR shown
    expect(html).to.include("Reason:"); // system reason block
    expect(html).to.include("Note from the admin:"); // admin note block (distinct)
    expect(html).to.include("Please send the remaining balance"); // the admin's words
    expect(html).to.match(/Submit Top-?Up Payment Proof/i); // top-up CTA
    expect(html).to.not.match(/>\s*Resubmit Payment Proof\s*</i);
  });

  it("includes the officer note for a non-OTHER reason too", async () => {
    await sendMerchOrderRejectedEmail("jane@example.com", {
      studentName: "Jane",
      orderRef: "MSC-MERCH-2026-0002",
      reason: "SCREENSHOT_UNCLEAR",
      reasonLabel: "Screenshot is unclear",
      financeNote: "Blurry — resend a clearer shot",
      trackingUrl: "http://t",
    });
    const { html } = sent[0];
    expect(html).to.include("Note from the admin:");
    expect(html).to.include("Blurry — resend a clearer shot");
    expect(html).to.match(/couldn't read/i);
  });
});

describe("sold-out (oversell) email HTML", () => {
  it("with a resolution link: swap + refund CTAs, NO resubmit button", async () => {
    await sendMerchOutOfStockEmail("jane@example.com", {
      studentName: "Jane",
      orderRef: "MSC-MERCH-2026-0003",
      itemName: "MSC Shirt",
      variantLabel: "M",
      swapUrl: "http://localhost:5173/merch/resolve/tok?intent=swap",
      refundUrl: "http://localhost:5173/merch/resolve/tok?intent=refund",
    });
    const { html } = sent[0];
    expect(html).to.match(/Choose Another Size/i); // swap CTA
    expect(html).to.include("intent=refund"); // refund CTA link
    expect(html).to.not.match(/Resubmit Payment Proof/i);
    expect(html).to.match(/not lost your money|money is safe|have not lost/i);
  });

  it("without a link: falls back to 'Finance will reach out', still no resubmit", async () => {
    await sendMerchOutOfStockEmail("jane@example.com", {
      studentName: "Jane",
      orderRef: "MSC-MERCH-2026-0004",
      itemName: "MSC Shirt",
      variantLabel: "M",
    });
    const { html } = sent[0];
    expect(html).to.not.match(/Resubmit Payment Proof/i);
    expect(html).to.match(/reach out|contact/i);
  });
});

describe("refund email HTML", () => {
  it("renders the human method label (Maya), never the raw enum", async () => {
    await sendMerchRefundProcessedEmail("jane@example.com", {
      studentName: "Jane",
      orderRef: "MSC-MERCH-2026-0005",
      amount: 350,
      method: "MAYA",
      referenceNumber: "MAYA-1",
    });
    const { html } = sent[0];
    expect(html).to.include("Maya");
    expect(html).to.not.include("via MAYA");
    expect(html).to.include("₱350.00");
  });

  it("OTHER method points the student to the note", async () => {
    await sendMerchRefundProcessedEmail("jane@example.com", {
      studentName: "Jane",
      orderRef: "MSC-MERCH-2026-0006",
      amount: 6.7,
      method: "OTHER",
      note: "Refunded as GCash load by the treasurer.",
    });
    const { html } = sent[0];
    expect(html).to.not.include("via OTHER");
    expect(html).to.match(/see the note below/i);
    expect(html).to.include("Refunded as GCash load");
  });
});
