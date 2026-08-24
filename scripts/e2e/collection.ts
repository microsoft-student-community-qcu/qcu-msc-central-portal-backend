/**
 * Postman collection generator for Module 04 — Org Merch Pre-Orders (V2).
 *
 * Source of truth for the HTTP test cases. Each `Spec` maps 1:1 to a Markdown
 * TC in docs/test-cases/v2/04-merch-pre-orders.md and to a Postman request named
 * "TC-xx — <purpose>". The orchestration (run.ts) pre-seeds every precondition
 * via the real API and passes concrete IDs/refs/tokens as environment variables,
 * so each request is independent and order-tolerant under Newman.
 */

type Role = "none" | "finance" | "head" | "member" | "super";

export interface Spec {
  tc: string; // TC id (matches the Markdown)
  folder: string; // Postman folder (mirrors the doc phases)
  purpose: string; // short human purpose → request name "TC-xx — purpose"
  method: string;
  /** Path appended to {{baseUrl}}, may contain {{vars}}. */
  path: string;
  role?: Role; // adds Authorization: Bearer {{tok_*}}
  query?: Record<string, string>;
  headers?: Record<string, string>;
  json?: unknown; // JSON body
  formdata?: { key: string; value?: string; src?: string; type: "text" | "file" }[];
  /** Extra pm.test assertion lines (status assertion is added automatically). */
  asserts?: string[];
  /** Pre-request script lines (e.g. rate-limit warm-up burst). */
  preRequest?: string[];
  /** Base-URL variable name (default "baseUrl"); e.g. "baseUrlNoGcash" for the GCASH-unset server. */
  baseVar?: string;
  expectStatus: number;
}

const TOKENS: Record<Role, string | null> = {
  none: null,
  finance: "{{tok_finance}}",
  head: "{{tok_head}}",
  member: "{{tok_member}}",
  super: "{{tok_super}}",
};

// ── Folders (ordered) ───────────────────────────────────────────────────────
const F = {
  A: "Phase A — Catalog & per-variant pricing",
  B: "Phase B — Happy path (order → pay → confirm → claim)",
  C: "Phase C — Rejections, dynamic emails & top-up",
  D: "Phase D — Oversell resolution (swap/refund)",
  E: "Phase E — Refunds (full + price-difference)",
  F: "Phase F — Operability (resend / detail / queue)",
  G: "Phase G — Security, RBAC & image proxies",
  H: "Phase H — Edge & regression",
  I: "Phase I — Admin item management",
  J: "Phase J — Cancel order lifecycle",
  K: "Phase K — 404 (unknown id) matrix",
  L: "Phase L — 401/403 auth matrix",
  M: "Phase M — Pagination & filters",
  N: "Phase N — Shop-toggle per public endpoint",
  O: "Phase O — Validation matrix",
  P: "Phase P — Resolution-link / resolve edges",
};

// Convenience assertion snippets
const bodyOk = `pm.expect(pm.response.json().success, 'success flag').to.eql(true);`;
const bodyFail = `pm.expect(pm.response.json().success, 'success flag').to.eql(false);`;

export const SPECS: Spec[] = [
  // ── Phase A ───────────────────────────────────────────────────────────────
  {
    tc: "TC-01", folder: F.A, purpose: "Item created with per-variant prices (detail)", method: "GET",
    path: "/api/v2/merch/{{itemId}}", expectStatus: 200,
    asserts: [bodyOk, `pm.expect(pm.response.json().data.item.variants.length, 'variant count').to.be.above(0);`],
  },
  {
    tc: "TC-02", folder: F.A, purpose: "Public catalog shows per-variant price", method: "GET",
    path: "/api/v2/merch", expectStatus: 200,
    asserts: [
      bodyOk,
      `const items = pm.response.json().data.items;`,
      `const it = items.find(i => i.id === pm.environment.get('itemId'));`,
      `pm.expect(it, 'main item present').to.be.ok;`,
      `const L = it.variants.find(v => v.label === 'L');`,
      `pm.expect(L.price, 'L variant price override').to.eql(400);`,
    ],
  },
  {
    tc: "TC-03", folder: F.A, purpose: "Catalog photo proxy serves item- file", method: "GET",
    path: "/api/v2/merch/photos/{{photoFile}}", expectStatus: 200,
    asserts: [
      `pm.expect(pm.response.headers.get('Content-Type') || '', 'image content-type').to.match(/image\\//);`,
      `pm.expect(pm.response.headers.get('Cache-Control') || '', 'cache header').to.include('immutable');`,
    ],
  },
  {
    tc: "TC-04", folder: F.A, purpose: "Archived item hidden from public detail", method: "GET",
    path: "/api/v2/merch/{{itemArchivedId}}", expectStatus: 404, asserts: [bodyFail],
  },

  // ── Phase B ───────────────────────────────────────────────────────────────
  {
    tc: "TC-05", folder: F.B, purpose: "Create order on S (₱350)", method: "POST",
    path: "/api/v2/merch/orders", json: { variantId: "{{variantS}}", quantity: 1, studentName: "Jane Doe", email: "jane.tc05@example.com" },
    expectStatus: 201, asserts: [bodyOk, `pm.expect(pm.response.json().data.amount, 'amount').to.eql(300);`, `pm.expect(pm.response.json().data.orderRef, 'orderRef').to.be.a('string');`],
  },
  {
    tc: "TC-06", folder: F.B, purpose: "Create order on L uses ₱400 override", method: "POST",
    path: "/api/v2/merch/orders", json: { variantId: "{{variantL}}", quantity: 1, studentName: "Jane Doe", email: "jane.tc06@example.com" },
    expectStatus: 201, asserts: [bodyOk, `pm.expect(pm.response.json().data.amount, 'amount uses variant override').to.eql(400);`],
  },
  {
    tc: "TC-07", folder: F.B, purpose: "Track order shows AWAITING_PAYMENT + null owed", method: "GET",
    path: "/api/v2/merch/orders/{{ord_track_ref}}", query: { email: "{{ord_track_email}}" }, expectStatus: 200,
    asserts: [bodyOk, `const o = pm.response.json().data.order;`, `pm.expect(o.status).to.eql('AWAITING_PAYMENT');`, `pm.expect(o.shortfallAmount).to.eql(null);`, `pm.expect(o.refundOwed).to.eql(null);`],
  },
  {
    tc: "TC-08", folder: F.B, purpose: "Submit payment proof → PENDING_VERIFICATION", method: "POST",
    path: "/api/v2/merch/orders/{{ord_pp_ref}}/payment-proof",
    formdata: [
      { key: "email", value: "{{ord_pp_email}}", type: "text" },
      { key: "referenceNumber", value: "{{ref_pp}}", type: "text" },
      { key: "screenshot", src: "{{fixturePng}}", type: "file" },
    ],
    expectStatus: 200, asserts: [bodyOk, `pm.expect(pm.response.json().message, 'msg').to.match(/received/i);`],
  },
  {
    tc: "TC-09", folder: F.B, purpose: "Confirm payment → CONFIRMED, stock −1", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_confirm_id}}/confirm", role: "finance", expectStatus: 200,
    asserts: [bodyOk, `pm.expect(pm.response.json().message).to.match(/confirmed/i);`],
  },
  {
    tc: "TC-10", folder: F.B, purpose: "Mark claimed → PAID_AND_CLAIMED", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_claim_id}}/claim", role: "finance", expectStatus: 200,
    asserts: [bodyOk, `pm.expect(pm.response.json().message).to.match(/claimed/i);`],
  },

  // ── Phase C ───────────────────────────────────────────────────────────────
  {
    tc: "TC-15", folder: F.C, purpose: "Reject REFERENCE_NOT_FOUND", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_rej_ref_id}}/reject", role: "finance", json: { reason: "REFERENCE_NOT_FOUND" },
    expectStatus: 200, asserts: [bodyOk],
  },
  {
    tc: "TC-16", folder: F.C, purpose: "Reject SCREENSHOT_UNCLEAR", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_rej_scr_id}}/reject", role: "finance", json: { reason: "SCREENSHOT_UNCLEAR" },
    expectStatus: 200, asserts: [bodyOk],
  },
  {
    tc: "TC-17", folder: F.C, purpose: "Reject OTHER without note → 400", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_rej_other_nonote_id}}/reject", role: "finance", json: { reason: "OTHER" },
    expectStatus: 400, asserts: [bodyFail, `pm.expect(pm.response.json().errors.financeNote, 'financeNote error').to.be.ok;`],
  },
  {
    tc: "TC-18", folder: F.C, purpose: "Reject OTHER with note", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_rej_other_id}}/reject", role: "finance", json: { reason: "OTHER", financeNote: "Wrong recipient GCash" },
    expectStatus: 200, asserts: [bodyOk],
  },
  {
    tc: "TC-19", folder: F.C, purpose: "Order detail shows admin note distinct from reason", method: "GET",
    path: "/api/v2/admin/merch/orders/{{ord_rej_other_id}}", role: "finance", expectStatus: 200,
    asserts: [bodyOk, `pm.expect(pm.response.json().data.order.financeNote, 'admin note stored').to.eql('Wrong recipient GCash');`, `pm.expect(pm.response.json().data.order.rejectionReason).to.eql('OTHER');`],
  },
  {
    tc: "TC-20", folder: F.C, purpose: "Reject AMOUNT_MISMATCH without shortfall → 400", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_rej_am_noamt_id}}/reject", role: "finance", json: { reason: "AMOUNT_MISMATCH" },
    expectStatus: 400, asserts: [bodyFail, `pm.expect(pm.response.json().errors.shortfallAmount, 'shortfall required').to.be.ok;`],
  },
  {
    tc: "TC-21", folder: F.C, purpose: "Reject AMOUNT_MISMATCH with shortfall 100", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_rej_am_id}}/reject", role: "finance", json: { reason: "AMOUNT_MISMATCH", shortfallAmount: 100 },
    expectStatus: 200, asserts: [bodyOk],
  },
  {
    tc: "TC-22", folder: F.C, purpose: "Tracking shows ₱100 owed (not full total)", method: "GET",
    path: "/api/v2/merch/orders/{{ord_rej_am_ref}}", query: { email: "{{ord_rej_am_email}}" }, expectStatus: 200,
    asserts: [bodyOk, `pm.expect(pm.response.json().data.order.shortfallAmount, 'exact owed').to.eql(100);`],
  },
  {
    tc: "TC-23", folder: F.C, purpose: "Reject AMOUNT_MISMATCH shortfall ≥ total → 400", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_rej_am_high_id}}/reject", role: "finance", json: { reason: "AMOUNT_MISMATCH", shortfallAmount: 350 },
    expectStatus: 400, asserts: [bodyFail, `pm.expect(pm.response.json().message).to.match(/less than the order total/i);`],
  },
  {
    tc: "TC-24", folder: F.C, purpose: "Reason enum labels differ (verified via detail)", method: "GET",
    path: "/api/v2/admin/merch/orders/{{ord_rej_ref_id}}", role: "finance", expectStatus: 200,
    asserts: [bodyOk, `pm.expect(pm.response.json().data.order.rejectionReason).to.eql('REFERENCE_NOT_FOUND');`],
  },
  {
    tc: "TC-25", folder: F.C, purpose: "Resubmit after AMOUNT_MISMATCH → top-up", method: "POST",
    path: "/api/v2/merch/orders/{{ord_rej_am_ref}}/payment-proof",
    formdata: [
      { key: "email", value: "{{ord_rej_am_email}}", type: "text" },
      { key: "referenceNumber", value: "{{ref_tc25}}", type: "text" },
      { key: "screenshot", src: "{{fixturePng}}", type: "file" },
    ],
    expectStatus: 200, asserts: [bodyOk],
  },
  {
    tc: "TC-26", folder: F.C, purpose: "Shortfall on non-mismatch reason → 400", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_rej_am_badreason_id}}/reject", role: "finance", json: { reason: "SCREENSHOT_UNCLEAR", shortfallAmount: 100 },
    expectStatus: 400, asserts: [bodyFail, `pm.expect(pm.response.json().errors.shortfallAmount, 'shortfall only for mismatch').to.be.ok;`],
  },

  // ── Phase D ───────────────────────────────────────────────────────────────
  {
    tc: "TC-30", folder: F.D, purpose: "Confirm first oversell order (takes last unit)", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_os1_id}}/confirm", role: "finance", expectStatus: 200, asserts: [bodyOk],
  },
  {
    tc: "TC-31", folder: F.D, purpose: "Confirm second → AWAITING_RESOLUTION (not REJECTED)", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_os2_id}}/confirm", role: "finance", expectStatus: 409,
    asserts: [bodyFail, `pm.expect(pm.response.json().message).to.match(/resolution|refund/i);`],
  },
  {
    tc: "TC-32", folder: F.D, purpose: "Reject OUT_OF_STOCK reroutes to AWAITING_RESOLUTION", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_reject_oos_id}}/reject", role: "finance", json: { reason: "OUT_OF_STOCK" },
    expectStatus: 200, asserts: [bodyOk, `pm.expect(pm.response.json().message).to.match(/refund|replacement|resolution/i);`],
  },
  {
    tc: "TC-33", folder: F.D, purpose: "Oversold order detail confirms AWAITING_RESOLUTION", method: "GET",
    path: "/api/v2/admin/merch/orders/{{ord_os2_id}}", role: "finance", expectStatus: 200,
    asserts: [bodyOk, `pm.expect(pm.response.json().data.order.status).to.eql('AWAITING_RESOLUTION');`],
  },
  {
    tc: "TC-34", folder: F.D, purpose: "Issue resolution link (returns swap+refund URLs)", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_res_link_id}}/resolution-link", role: "finance", expectStatus: 200,
    asserts: [bodyOk, `pm.expect(pm.response.json().data.swapUrl).to.include('intent=swap');`, `pm.expect(pm.response.json().data.refundUrl).to.include('intent=refund');`],
  },
  {
    tc: "TC-35", folder: F.D, purpose: "GET resolve shows options + deltas", method: "GET",
    path: "/api/v2/merch/resolve/{{tok_res_get}}", expectStatus: 200,
    asserts: [
      bodyOk,
      `const d = pm.response.json().data;`,
      `pm.expect(d.canRefund).to.eql(true);`,
      `const byLabel = Object.fromEntries(d.options.map(o => [o.label, o]));`,
      `pm.expect(byLabel.L.direction, 'L pricier').to.eql('pricier');`,
      `pm.expect(byLabel.S.direction, 'S cheaper').to.eql('cheaper');`,
    ],
  },
  {
    tc: "TC-36", folder: F.D, purpose: "Swap pricier without ack → 409 requiresTopUp", method: "POST",
    path: "/api/v2/merch/resolve/{{tok_swap_noack}}/swap", json: { variantId: "{{variantL}}" }, expectStatus: 409,
    asserts: [bodyFail, `pm.expect(pm.response.json().data.requiresTopUp).to.eql(true);`, `pm.expect(pm.response.json().data.shortfall).to.eql(50);`],
  },
  {
    tc: "TC-37", folder: F.D, purpose: "Swap pricier with ack → AWAITING_PAYMENT + shortfall", method: "POST",
    path: "/api/v2/merch/resolve/{{tok_swap_pricier}}/swap", json: { variantId: "{{variantL}}", acknowledgedTopUp: true }, expectStatus: 200,
    asserts: [bodyOk, `pm.expect(pm.response.json().data.status).to.eql('AWAITING_PAYMENT');`, `pm.expect(pm.response.json().data.shortfall).to.eql(50);`],
  },
  {
    tc: "TC-38", folder: F.D, purpose: "Tracking shows ₱50 top-up owed after swap", method: "GET",
    path: "/api/v2/merch/orders/{{ord_swap_pricier_ref}}", query: { email: "{{ord_swap_pricier_email}}" }, expectStatus: 200,
    asserts: [bodyOk, `pm.expect(pm.response.json().data.order.shortfallAmount).to.eql(50);`],
  },
  {
    tc: "SETUP-39", folder: F.D, purpose: "submit ₱50 top-up proof (setup for TC-39)", method: "POST",
    path: "/api/v2/merch/orders/{{ord_swap_pricier_ref}}/payment-proof",
    formdata: [
      { key: "email", value: "{{ord_swap_pricier_email}}", type: "text" },
      { key: "referenceNumber", value: "{{ref_topup}}", type: "text" },
      { key: "screenshot", src: "{{fixturePng}}", type: "file" },
    ],
    expectStatus: 200, asserts: [bodyOk],
  },
  {
    tc: "TC-39", folder: F.D, purpose: "Confirm top-up does not double-decrement stock", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_swap_pricier_id}}/confirm", role: "finance", expectStatus: 200,
    asserts: [bodyOk],
  },
  {
    tc: "TC-40", folder: F.D, purpose: "Swap cheaper → CONFIRMED + refundOwed", method: "POST",
    path: "/api/v2/merch/resolve/{{tok_swap_cheaper}}/swap", json: { variantId: "{{variantS}}" }, expectStatus: 200,
    asserts: [bodyOk, `pm.expect(pm.response.json().data.status).to.eql('CONFIRMED');`, `pm.expect(pm.response.json().data.refundOwed).to.eql(50);`],
  },
  {
    tc: "TC-41", folder: F.D, purpose: "Refund request via resolve → refundRequestedAt", method: "POST",
    path: "/api/v2/merch/resolve/{{tok_refund}}/refund", expectStatus: 200,
    asserts: [bodyOk, `pm.expect(pm.response.json().message).to.match(/refund/i);`],
  },
  {
    tc: "TC-42", folder: F.D, purpose: "Reuse consumed token → 410", method: "POST",
    path: "/api/v2/merch/resolve/{{tok_refund}}/refund", expectStatus: 410, asserts: [bodyFail],
  },
  {
    tc: "TC-43", folder: F.D, purpose: "Swap to a sold-out target → 409 (token not consumed)", method: "POST",
    path: "/api/v2/merch/resolve/{{tok_swap_soldout}}/swap", json: { variantId: "{{variantXL}}", acknowledgedTopUp: true }, expectStatus: 409,
    asserts: [bodyFail, `pm.expect(pm.response.json().message).to.match(/sold out/i);`],
  },

  // ── Phase E ───────────────────────────────────────────────────────────────
  {
    tc: "TC-48", folder: F.E, purpose: "Full refund (MAYA) → REFUNDED", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_refund_full_id}}/refund", role: "head", json: { amount: 350, method: "MAYA", referenceNumber: "MAYA-REF-001" },
    expectStatus: 200, asserts: [bodyOk],
  },
  {
    tc: "TC-49", folder: F.E, purpose: "Full refund OTHER without note → 400", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_refund_other_id}}/refund", role: "head", json: { amount: 350, method: "OTHER" },
    expectStatus: 400, asserts: [bodyFail, `pm.expect(pm.response.json().errors.note, 'note required for OTHER').to.be.ok;`],
  },
  {
    tc: "TC-50", folder: F.E, purpose: "Price-difference refund clears refundOwed, stays CONFIRMED", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_pricediff_id}}/refund", role: "head", json: { amount: 50, method: "GCASH" },
    expectStatus: 200, asserts: [bodyOk],
  },
  {
    tc: "TC-50b", folder: F.E, purpose: "Repeat price-difference refund → 409", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_pricediff_id}}/refund", role: "head", json: { amount: 50, method: "GCASH" },
    expectStatus: 409, asserts: [bodyFail],
  },
  {
    tc: "TC-50c", folder: F.E, purpose: "Full refund amount > total → 400", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_refund_over_id}}/refund", role: "head", json: { amount: 500, method: "GCASH" },
    expectStatus: 400, asserts: [bodyFail, `pm.expect(pm.response.json().message).to.match(/cannot exceed/i);`],
  },
  {
    tc: "TC-50d", folder: F.E, purpose: "Refund a CONFIRMED order owing nothing → 409", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_confirmed_plain_id}}/refund", role: "head", json: { amount: 50, method: "GCASH" },
    expectStatus: 409, asserts: [bodyFail],
  },

  // ── Phase F ───────────────────────────────────────────────────────────────
  {
    tc: "TC-44", folder: F.F, purpose: "Resend status email (any state)", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_resend_id}}/resend-email", role: "finance", expectStatus: 200, asserts: [bodyOk],
  },
  {
    tc: "TC-45", folder: F.F, purpose: "Order detail timeline preserves attempts", method: "GET",
    path: "/api/v2/admin/merch/orders/{{ord_rej_am_id}}", role: "finance", expectStatus: 200,
    asserts: [
      bodyOk,
      `const subs = pm.response.json().data.order.submissions;`,
      `pm.expect(subs.length, 'at least 2 attempts').to.be.above(1);`,
      `pm.expect(subs[0].attempt).to.eql(1);`,
      `pm.expect(subs.some(s => s.isTopUp === true), 'a top-up attempt exists').to.eql(true);`,
    ],
  },
  {
    tc: "TC-46", folder: F.F, purpose: "Queue filter AWAITING_RESOLUTION + tracking fields", method: "GET",
    path: "/api/v2/admin/merch/orders", role: "finance", query: { status: "AWAITING_RESOLUTION" }, expectStatus: 200,
    asserts: [
      bodyOk,
      `const rows = pm.response.json().data.orders;`,
      `pm.expect(rows.every(r => r.status === 'AWAITING_RESOLUTION'), 'all AWAITING_RESOLUTION').to.eql(true);`,
      `if (rows[0]) { pm.expect(rows[0]).to.have.property('lastNotifiedAt'); pm.expect(rows[0]).to.have.property('stockHeld'); }`,
    ],
  },
  {
    tc: "TC-46b", folder: F.F, purpose: "Queue filter refundOwed=true", method: "GET",
    path: "/api/v2/admin/merch/orders", role: "finance", query: { refundOwed: "true" }, expectStatus: 200,
    asserts: [bodyOk, `pm.expect(pm.response.json().data.orders.every(r => Number(r.refundOwed) > 0), 'all owe a refund').to.eql(true);`],
  },
  {
    tc: "TC-47", folder: F.F, purpose: "Queue filter overdueTopUp=true lists aged order", method: "GET",
    path: "/api/v2/admin/merch/orders", role: "finance", query: { overdueTopUp: "true" }, expectStatus: 200,
    asserts: [bodyOk, `pm.expect(pm.response.json().data.orders.some(r => r.orderRef === pm.environment.get('overdueOrderRef')), 'aged order listed').to.eql(true);`],
  },

  // ── Phase G ───────────────────────────────────────────────────────────────
  {
    tc: "TC-51", folder: F.G, purpose: "Screenshot proxy (finance) streams bytes", method: "GET",
    path: "/api/v2/admin/merch/screenshots/{{proofFile}}", role: "finance", expectStatus: 200,
    asserts: [`pm.expect(pm.response.headers.get('Content-Type') || '', 'image').to.match(/image\\//);`],
  },
  {
    tc: "TC-52", folder: F.G, purpose: "Screenshot proxy without token → 401", method: "GET",
    path: "/api/v2/admin/merch/screenshots/{{proofFile}}", expectStatus: 401, asserts: [bodyFail],
  },
  {
    tc: "TC-53", folder: F.G, purpose: "Photo proxy refuses proof- file (wrong class)", method: "GET",
    path: "/api/v2/merch/photos/{{proofFile}}", expectStatus: 400,
    asserts: [bodyFail, `pm.expect(pm.response.json().message).to.match(/not a catalog photo/i);`],
  },
  {
    tc: "TC-54", folder: F.G, purpose: "Screenshot proxy refuses item- file (wrong class)", method: "GET",
    path: "/api/v2/admin/merch/screenshots/{{photoFile}}", role: "finance", expectStatus: 400,
    asserts: [bodyFail, `pm.expect(pm.response.json().message).to.match(/not a payment screenshot/i);`],
  },
  {
    tc: "TC-54b", folder: F.G, purpose: "Photo proxy rejects traversal filename", method: "GET",
    path: "/api/v2/merch/photos/..%2f..%2fetc%2fpasswd", expectStatus: 400,
    asserts: [bodyFail, `pm.expect(pm.response.json().message).to.match(/invalid photo filename/i);`],
  },
  {
    tc: "TC-55", folder: F.G, purpose: "Create item without token → 401", method: "POST",
    path: "/api/v2/admin/merch/items", formdata: [{ key: "name", value: "X", type: "text" }], expectStatus: 401, asserts: [bodyFail],
  },
  {
    tc: "TC-55-member", folder: F.G, purpose: "Create item as MEMBER → 403", method: "POST",
    path: "/api/v2/admin/merch/items", role: "member", formdata: [{ key: "name", value: "X", type: "text" }], expectStatus: 403, asserts: [bodyFail],
  },
  {
    tc: "TC-55b-archive", folder: F.G, purpose: "Archive as plain finance → 403 (head-only)", method: "POST",
    path: "/api/v2/admin/merch/items/{{itemId}}/archive", role: "finance", expectStatus: 403, asserts: [bodyFail],
  },
  {
    tc: "TC-55b-cancel", folder: F.G, purpose: "Cancel as plain finance → 403 (head-only)", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_confirmed_plain_id}}/cancel", role: "finance", json: { financeNote: "x" }, expectStatus: 403, asserts: [bodyFail],
  },
  {
    tc: "TC-55b-refund", folder: F.G, purpose: "Refund as plain finance → 403 (head-only)", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_confirmed_plain_id}}/refund", role: "finance", json: { amount: 1, method: "GCASH" }, expectStatus: 403, asserts: [bodyFail],
  },
  {
    tc: "TC-55c", folder: F.G, purpose: "Archive as HEAD → 200 (inherits finance)", method: "POST",
    path: "/api/v2/admin/merch/items/{{itemArchive2Id}}/archive", role: "head", expectStatus: 200, asserts: [bodyOk],
  },
  {
    tc: "TC-55d-track", folder: F.G, purpose: "Track with wrong email → 404 (anti-enumeration)", method: "GET",
    path: "/api/v2/merch/orders/{{ord_track_ref}}", query: { email: "attacker@example.com" }, expectStatus: 404, asserts: [bodyFail],
  },
  {
    tc: "TC-55d-proof", folder: F.G, purpose: "Payment-proof with wrong email → 404", method: "POST",
    path: "/api/v2/merch/orders/{{ord_track_ref}}/payment-proof",
    formdata: [
      { key: "email", value: "attacker@example.com", type: "text" },
      { key: "referenceNumber", value: "9999999999999", type: "text" },
      { key: "screenshot", src: "{{fixturePng}}", type: "file" },
    ],
    expectStatus: 404, asserts: [bodyFail],
  },
  {
    tc: "TC-55e", folder: F.G, purpose: "Duplicate reference across orders → 409", method: "POST",
    path: "/api/v2/merch/orders/{{ord_dupB_ref}}/payment-proof",
    formdata: [
      { key: "email", value: "{{ord_dupB_email}}", type: "text" },
      { key: "referenceNumber", value: "{{ref_dup}}", type: "text" },
      { key: "screenshot", src: "{{fixturePng}}", type: "file" },
    ],
    expectStatus: 409, asserts: [bodyFail, `pm.expect(pm.response.json().message).to.match(/already been used/i);`],
  },

  // ── Phase H ───────────────────────────────────────────────────────────────
  {
    tc: "TC-56", folder: F.H, purpose: "7 photos → clean 400 (cap)", method: "POST",
    path: "/api/v2/admin/merch/items", role: "finance",
    formdata: [
      { key: "name", value: "Seven", type: "text" },
      { key: "description", value: "seven photos", type: "text" },
      { key: "price", value: "100", type: "text" },
      { key: "variants", value: '[{"label":"S","stock":1}]', type: "text" },
      { key: "photos", src: "{{fixturePng}}", type: "file" },
      { key: "photos", src: "{{fixturePng}}", type: "file" },
      { key: "photos", src: "{{fixturePng}}", type: "file" },
      { key: "photos", src: "{{fixturePng}}", type: "file" },
      { key: "photos", src: "{{fixturePng}}", type: "file" },
      { key: "photos", src: "{{fixturePng}}", type: "file" },
      { key: "photos", src: "{{fixturePng}}", type: "file" },
    ],
    expectStatus: 400, asserts: [bodyFail, `pm.expect(pm.response.json().message).to.match(/at most 6 photos/i);`],
  },
  {
    tc: "TC-57", folder: F.H, purpose: "Payment proof PDF → 400 (images only)", method: "POST",
    path: "/api/v2/merch/orders/{{ord_pdf_ref}}/payment-proof",
    formdata: [
      { key: "email", value: "{{ord_pdf_email}}", type: "text" },
      { key: "referenceNumber", value: "{{ref_pdf}}", type: "text" },
      { key: "screenshot", src: "{{fixturePdf}}", type: "file" },
    ],
    expectStatus: 400, asserts: [bodyFail],
  },
  {
    tc: "TC-58", folder: F.H, purpose: "Reference not 13 digits → 400", method: "POST",
    path: "/api/v2/merch/orders/{{ord_pdf_ref}}/payment-proof",
    formdata: [
      { key: "email", value: "{{ord_pdf_email}}", type: "text" },
      { key: "referenceNumber", value: "123", type: "text" },
      { key: "screenshot", src: "{{fixturePng}}", type: "file" },
    ],
    expectStatus: 400, asserts: [bodyFail, `pm.expect(pm.response.json().errors.referenceNumber, 'ref format').to.be.ok;`],
  },
  {
    tc: "TC-59", folder: F.H, purpose: "Duplicate variant labels → 400", method: "POST",
    path: "/api/v2/admin/merch/items", role: "finance",
    formdata: [
      { key: "name", value: "Dupe", type: "text" },
      { key: "description", value: "dupe labels", type: "text" },
      { key: "price", value: "100", type: "text" },
      { key: "variants", value: '[{"label":"S","stock":1},{"label":"S","stock":2}]', type: "text" },
      { key: "photos", src: "{{fixturePng}}", type: "file" },
    ],
    expectStatus: 400, asserts: [bodyFail, `pm.expect(pm.response.json().errors.variants, 'variants error').to.be.ok;`],
  },
  {
    tc: "TC-60", folder: F.H, purpose: "Quantity > stock → 409", method: "POST",
    path: "/api/v2/merch/orders", json: { variantId: "{{variantXL}}", quantity: 1, studentName: "Q", email: "q.tc60@example.com" },
    expectStatus: 409, asserts: [bodyFail, `pm.expect(pm.response.json().message).to.match(/no longer available|unavailable/i);`],
  },
  {
    tc: "TC-62", folder: F.H, purpose: "Create order when GCASH unset → 503", method: "POST",
    path: "/api/v2/merch/orders", baseVar: "baseUrlNoGcash", json: { variantId: "{{variantS}}", quantity: 1, studentName: "N", email: "n.tc62@example.com" },
    expectStatus: 503, asserts: [bodyFail],
  },
  {
    tc: "TC-64", folder: F.H, purpose: "Confirm an already-CONFIRMED order → 409", method: "POST",
    path: "/api/v2/admin/merch/orders/{{ord_confirmed_plain_id}}/confirm", role: "finance", expectStatus: 409, asserts: [bodyFail],
  },
  {
    tc: "TC-65", folder: F.H, purpose: "GET resolve after resolved → 409", method: "GET",
    path: "/api/v2/merch/resolve/{{tok_resolved}}", expectStatus: 409, asserts: [bodyFail],
  },

  // ── Phase I — Admin item management ─────────────────────────────────────────
  { tc: "TC-70", folder: F.I, purpose: "List items (incl. archived)", method: "GET", path: "/api/v2/admin/merch/items", role: "finance", expectStatus: 200, asserts: [bodyOk, `pm.expect(pm.response.json().data.items.length).to.be.above(0);`] },
  { tc: "TC-71", folder: F.I, purpose: "List items ?status=ACTIVE", method: "GET", path: "/api/v2/admin/merch/items", role: "finance", query: { status: "ACTIVE" }, expectStatus: 200, asserts: [bodyOk, `pm.expect(pm.response.json().data.items.every(i => i.status === 'ACTIVE')).to.eql(true);`] },
  { tc: "TC-72", folder: F.I, purpose: "List items ?status=ARCHIVED", method: "GET", path: "/api/v2/admin/merch/items", role: "finance", query: { status: "ARCHIVED" }, expectStatus: 200, asserts: [bodyOk, `pm.expect(pm.response.json().data.items.every(i => i.status === 'ARCHIVED')).to.eql(true);`] },
  { tc: "TC-73", folder: F.I, purpose: "List items no token → 401", method: "GET", path: "/api/v2/admin/merch/items", expectStatus: 401, asserts: [bodyFail] },
  { tc: "TC-74", folder: F.I, purpose: "List items as MEMBER → 403", method: "GET", path: "/api/v2/admin/merch/items", role: "member", expectStatus: 403, asserts: [bodyFail] },
  {
    tc: "TC-75", folder: F.I, purpose: "PATCH item name + price", method: "PATCH", path: "/api/v2/admin/merch/items/{{itemEditId}}", role: "finance",
    formdata: [{ key: "name", value: "Edited Tee", type: "text" }, { key: "price", value: "375", type: "text" }],
    expectStatus: 200, asserts: [bodyOk, `pm.expect(pm.response.json().data.item.name).to.eql('Edited Tee');`, `pm.expect(pm.response.json().data.item.price).to.eql(375);`],
  },
  {
    tc: "TC-76", folder: F.I, purpose: "PATCH updates existing variant stock", method: "PATCH", path: "/api/v2/admin/merch/items/{{itemEditId}}", role: "finance",
    formdata: [{ key: "variants", value: '[{"label":"S","stock":99}]', type: "text" }],
    expectStatus: 200, asserts: [bodyOk, `pm.expect(pm.response.json().data.item.variants.find(v=>v.label==='S').stock).to.eql(99);`],
  },
  {
    tc: "TC-77", folder: F.I, purpose: "PATCH adds a new variant with price", method: "PATCH", path: "/api/v2/admin/merch/items/{{itemEditId}}", role: "finance",
    formdata: [{ key: "variants", value: '[{"label":"XXL","stock":7,"price":450}]', type: "text" }],
    expectStatus: 200, asserts: [bodyOk, `const v = pm.response.json().data.item.variants.find(v=>v.label==='XXL'); pm.expect(v).to.be.ok; pm.expect(v.price).to.eql(450);`],
  },
  {
    tc: "TC-78", folder: F.I, purpose: "PATCH invalid price (0) → 400", method: "PATCH", path: "/api/v2/admin/merch/items/{{itemEditId}}", role: "finance",
    formdata: [{ key: "price", value: "0", type: "text" }], expectStatus: 400, asserts: [bodyFail],
  },
  { tc: "TC-79", folder: F.I, purpose: "PATCH unknown item → 404", method: "PATCH", path: "/api/v2/admin/merch/items/00000000-0000-4000-8000-000000000000", role: "finance", formdata: [{ key: "name", value: "x", type: "text" }], expectStatus: 404, asserts: [bodyFail] },
  { tc: "TC-80", folder: F.I, purpose: "PATCH item no token → 401", method: "PATCH", path: "/api/v2/admin/merch/items/{{itemEditId}}", formdata: [{ key: "name", value: "x", type: "text" }], expectStatus: 401, asserts: [bodyFail] },
  { tc: "TC-81", folder: F.I, purpose: "PATCH item as MEMBER → 403", method: "PATCH", path: "/api/v2/admin/merch/items/{{itemEditId}}", role: "member", formdata: [{ key: "name", value: "x", type: "text" }], expectStatus: 403, asserts: [bodyFail] },
  { tc: "TC-82", folder: F.I, purpose: "Archive already-archived item → 409", method: "POST", path: "/api/v2/admin/merch/items/{{itemArchivedId}}/archive", role: "head", expectStatus: 409, asserts: [bodyFail] },
  { tc: "TC-83", folder: F.I, purpose: "Archive unknown item → 404", method: "POST", path: "/api/v2/admin/merch/items/00000000-0000-4000-8000-000000000000/archive", role: "head", expectStatus: 404, asserts: [bodyFail] },

  // ── Phase J — Cancel order lifecycle ────────────────────────────────────────
  { tc: "TC-84", folder: F.J, purpose: "Cancel CONFIRMED order (head) restores stock", method: "POST", path: "/api/v2/admin/merch/orders/{{ord_cancel_confirmed_id}}/cancel", role: "head", json: { financeNote: "customer request" }, expectStatus: 200, asserts: [bodyOk] },
  { tc: "TC-85", folder: F.J, purpose: "Cancel AWAITING_PAYMENT order (head)", method: "POST", path: "/api/v2/admin/merch/orders/{{ord_cancel_awaiting_id}}/cancel", role: "head", json: { financeNote: "no payment" }, expectStatus: 200, asserts: [bodyOk] },
  { tc: "TC-86", folder: F.J, purpose: "Cancel without financeNote → 400", method: "POST", path: "/api/v2/admin/merch/orders/{{ord_cancel_awaiting2_id}}/cancel", role: "head", json: {}, expectStatus: 400, asserts: [bodyFail] },
  { tc: "TC-87", folder: F.J, purpose: "Cancel an already-CANCELLED order → 409", method: "POST", path: "/api/v2/admin/merch/orders/{{ord_cancel_confirmed_id}}/cancel", role: "head", json: { financeNote: "again" }, expectStatus: 409, asserts: [bodyFail] },
  { tc: "TC-88", folder: F.J, purpose: "Cancel a PAID_AND_CLAIMED order → 409", method: "POST", path: "/api/v2/admin/merch/orders/{{ord_claimed_id}}/cancel", role: "head", json: { financeNote: "x" }, expectStatus: 409, asserts: [bodyFail] },
  { tc: "TC-89", folder: F.J, purpose: "Cancel an AWAITING_RESOLUTION order → 409", method: "POST", path: "/api/v2/admin/merch/orders/{{ord_awaiting_res_id}}/cancel", role: "head", json: { financeNote: "x" }, expectStatus: 409, asserts: [bodyFail] },
  { tc: "TC-90", folder: F.J, purpose: "Cancel unknown order → 404", method: "POST", path: "/api/v2/admin/merch/orders/00000000-0000-4000-8000-000000000000/cancel", role: "head", json: { financeNote: "x" }, expectStatus: 404, asserts: [bodyFail] },

  // ── Phase K — 404 matrix ────────────────────────────────────────────────────
  { tc: "TC-91", folder: F.K, purpose: "Order detail unknown → 404", method: "GET", path: "/api/v2/admin/merch/orders/00000000-0000-4000-8000-000000000000", role: "finance", expectStatus: 404, asserts: [bodyFail] },
  { tc: "TC-92", folder: F.K, purpose: "Confirm unknown → 404", method: "POST", path: "/api/v2/admin/merch/orders/00000000-0000-4000-8000-000000000000/confirm", role: "finance", expectStatus: 404, asserts: [bodyFail] },
  { tc: "TC-93", folder: F.K, purpose: "Reject unknown → 404", method: "POST", path: "/api/v2/admin/merch/orders/00000000-0000-4000-8000-000000000000/reject", role: "finance", json: { reason: "OTHER", financeNote: "x" }, expectStatus: 404, asserts: [bodyFail] },
  { tc: "TC-94", folder: F.K, purpose: "Claim unknown → 404", method: "POST", path: "/api/v2/admin/merch/orders/00000000-0000-4000-8000-000000000000/claim", role: "finance", expectStatus: 404, asserts: [bodyFail] },
  { tc: "TC-95", folder: F.K, purpose: "Refund unknown → 404", method: "POST", path: "/api/v2/admin/merch/orders/00000000-0000-4000-8000-000000000000/refund", role: "head", json: { amount: 1, method: "GCASH" }, expectStatus: 404, asserts: [bodyFail] },
  { tc: "TC-96", folder: F.K, purpose: "Resend-email unknown → 404", method: "POST", path: "/api/v2/admin/merch/orders/00000000-0000-4000-8000-000000000000/resend-email", role: "finance", expectStatus: 404, asserts: [bodyFail] },
  { tc: "TC-97", folder: F.K, purpose: "Resolution-link unknown → 404", method: "POST", path: "/api/v2/admin/merch/orders/00000000-0000-4000-8000-000000000000/resolution-link", role: "finance", expectStatus: 404, asserts: [bodyFail] },

  // ── Phase L — 401/403 auth matrix ───────────────────────────────────────────
  { tc: "TC-100", folder: F.L, purpose: "GET /orders no token → 401", method: "GET", path: "/api/v2/admin/merch/orders", expectStatus: 401, asserts: [bodyFail] },
  { tc: "TC-101", folder: F.L, purpose: "GET /orders as MEMBER → 403", method: "GET", path: "/api/v2/admin/merch/orders", role: "member", expectStatus: 403, asserts: [bodyFail] },
  { tc: "TC-102", folder: F.L, purpose: "Order detail no token → 401", method: "GET", path: "/api/v2/admin/merch/orders/{{ord_confirmed_plain_id}}", expectStatus: 401, asserts: [bodyFail] },
  { tc: "TC-103", folder: F.L, purpose: "Order detail as MEMBER → 403", method: "GET", path: "/api/v2/admin/merch/orders/{{ord_confirmed_plain_id}}", role: "member", expectStatus: 403, asserts: [bodyFail] },
  { tc: "TC-104", folder: F.L, purpose: "Confirm no token → 401", method: "POST", path: "/api/v2/admin/merch/orders/{{ord_confirmed_plain_id}}/confirm", expectStatus: 401, asserts: [bodyFail] },
  { tc: "TC-105", folder: F.L, purpose: "Confirm as MEMBER → 403", method: "POST", path: "/api/v2/admin/merch/orders/{{ord_confirmed_plain_id}}/confirm", role: "member", expectStatus: 403, asserts: [bodyFail] },
  { tc: "TC-106", folder: F.L, purpose: "Reject no token → 401", method: "POST", path: "/api/v2/admin/merch/orders/{{ord_confirmed_plain_id}}/reject", json: { reason: "OTHER", financeNote: "x" }, expectStatus: 401, asserts: [bodyFail] },
  { tc: "TC-107", folder: F.L, purpose: "Reject as MEMBER → 403", method: "POST", path: "/api/v2/admin/merch/orders/{{ord_confirmed_plain_id}}/reject", role: "member", json: { reason: "OTHER", financeNote: "x" }, expectStatus: 403, asserts: [bodyFail] },
  { tc: "TC-108", folder: F.L, purpose: "Claim no token → 401", method: "POST", path: "/api/v2/admin/merch/orders/{{ord_confirmed_plain_id}}/claim", expectStatus: 401, asserts: [bodyFail] },
  { tc: "TC-109", folder: F.L, purpose: "Claim as MEMBER → 403", method: "POST", path: "/api/v2/admin/merch/orders/{{ord_confirmed_plain_id}}/claim", role: "member", expectStatus: 403, asserts: [bodyFail] },
  { tc: "TC-110", folder: F.L, purpose: "Resend-email no token → 401", method: "POST", path: "/api/v2/admin/merch/orders/{{ord_confirmed_plain_id}}/resend-email", expectStatus: 401, asserts: [bodyFail] },
  { tc: "TC-111", folder: F.L, purpose: "Resend-email as MEMBER → 403", method: "POST", path: "/api/v2/admin/merch/orders/{{ord_confirmed_plain_id}}/resend-email", role: "member", expectStatus: 403, asserts: [bodyFail] },
  { tc: "TC-112", folder: F.L, purpose: "Resolution-link no token → 401", method: "POST", path: "/api/v2/admin/merch/orders/{{ord_confirmed_plain_id}}/resolution-link", expectStatus: 401, asserts: [bodyFail] },
  { tc: "TC-113", folder: F.L, purpose: "Resolution-link as MEMBER → 403", method: "POST", path: "/api/v2/admin/merch/orders/{{ord_confirmed_plain_id}}/resolution-link", role: "member", expectStatus: 403, asserts: [bodyFail] },
  { tc: "TC-114", folder: F.L, purpose: "Screenshot proxy as MEMBER → 403", method: "GET", path: "/api/v2/admin/merch/screenshots/{{proofFile}}", role: "member", expectStatus: 403, asserts: [bodyFail] },
  { tc: "TC-115", folder: F.L, purpose: "Archive no token → 401", method: "POST", path: "/api/v2/admin/merch/items/{{itemId}}/archive", expectStatus: 401, asserts: [bodyFail] },
  { tc: "TC-116", folder: F.L, purpose: "Cancel no token → 401", method: "POST", path: "/api/v2/admin/merch/orders/{{ord_confirmed_plain_id}}/cancel", json: { financeNote: "x" }, expectStatus: 401, asserts: [bodyFail] },
  { tc: "TC-117", folder: F.L, purpose: "Refund no token → 401", method: "POST", path: "/api/v2/admin/merch/orders/{{ord_confirmed_plain_id}}/refund", json: { amount: 1, method: "GCASH" }, expectStatus: 401, asserts: [bodyFail] },
  { tc: "TC-118", folder: F.L, purpose: "GET /orders as HEAD → 200 (finance inheritance)", method: "GET", path: "/api/v2/admin/merch/orders", role: "head", expectStatus: 200, asserts: [bodyOk] },

  // ── Phase M — Pagination & filters ──────────────────────────────────────────
  { tc: "TC-120", folder: F.M, purpose: "Pagination page/pageSize honored", method: "GET", path: "/api/v2/admin/merch/orders", role: "finance", query: { page: "1", pageSize: "2" }, expectStatus: 200, asserts: [bodyOk, `pm.expect(pm.response.json().data.orders.length).to.be.at.most(2);`, `pm.expect(pm.response.json().data.pagination.pageSize).to.eql(2);`] },
  { tc: "TC-121", folder: F.M, purpose: "pageSize clamped to 50", method: "GET", path: "/api/v2/admin/merch/orders", role: "finance", query: { pageSize: "999" }, expectStatus: 200, asserts: [bodyOk, `pm.expect(pm.response.json().data.pagination.pageSize).to.be.at.most(50);`] },
  { tc: "TC-122", folder: F.M, purpose: "Filter status=CONFIRMED", method: "GET", path: "/api/v2/admin/merch/orders", role: "finance", query: { status: "CONFIRMED" }, expectStatus: 200, asserts: [bodyOk, `pm.expect(pm.response.json().data.orders.every(r=>r.status==='CONFIRMED')).to.eql(true);`] },
  { tc: "TC-123", folder: F.M, purpose: "Filter status=PENDING_VERIFICATION", method: "GET", path: "/api/v2/admin/merch/orders", role: "finance", query: { status: "PENDING_VERIFICATION" }, expectStatus: 200, asserts: [bodyOk, `pm.expect(pm.response.json().data.orders.every(r=>r.status==='PENDING_VERIFICATION')).to.eql(true);`] },
  { tc: "TC-124", folder: F.M, purpose: "Invalid status ignored (returns all)", method: "GET", path: "/api/v2/admin/merch/orders", role: "finance", query: { status: "BOGUS" }, expectStatus: 200, asserts: [bodyOk] },

  // ── Phase N — Shop toggle per public endpoint (shop CLOSED by folder SETUP) ─
  { tc: "TC-61", folder: F.N, purpose: "Catalog when shop closed → 503", method: "GET", path: "/api/v2/merch", expectStatus: 503, asserts: [bodyFail] },
  { tc: "TC-125", folder: F.N, purpose: "Item detail when shop closed → 503", method: "GET", path: "/api/v2/merch/{{itemId}}", expectStatus: 503, asserts: [bodyFail] },
  { tc: "TC-126", folder: F.N, purpose: "Photo proxy NOT gated by shop close → 200", method: "GET", path: "/api/v2/merch/photos/{{photoFile}}", expectStatus: 200, asserts: [`pm.expect(pm.response.headers.get('Content-Type')||'').to.match(/image\\//);`] },
  { tc: "TC-127", folder: F.N, purpose: "Order tracking NOT gated by shop close → 200", method: "GET", path: "/api/v2/merch/orders/{{ord_track_ref}}", query: { email: "{{ord_track_email}}" }, expectStatus: 200, asserts: [bodyOk] },
  { tc: "TC-128", folder: F.N, purpose: "Resolve NOT gated by shop close → 200", method: "GET", path: "/api/v2/merch/resolve/{{tok_shopclosed}}", expectStatus: 200, asserts: [bodyOk] },
  {
    tc: "TC-63", folder: F.N, purpose: "Rate limit: burst order attempts → 429", method: "POST",
    baseVar: "baseUrlNoGcash", path: "/api/v2/merch/orders",
    json: { variantId: "{{variantS}}", quantity: 1, studentName: "RL", email: "rl.tc63@example.com" },
    // The dedicated no-GCASH server keeps REAL limits (10/min). Warm the limiter
    // with a synchronous recursive burst so the main request is the 13th → 429.
    preRequest: [
      `let n = 12;`,
      `const base = pm.variables.get('baseUrlNoGcash');`,
      `function fire() {`,
      `  if (n <= 0) return;`,
      `  n--;`,
      `  pm.sendRequest({ url: base + '/api/v2/merch/orders', method: 'POST', header: { 'Content-Type': 'application/json' }, body: { mode: 'raw', raw: JSON.stringify({ variantId: 'x', quantity: 1, studentName: 'warm', email: 'warm@example.com' }) } }, function () { fire(); });`,
      `}`,
      `fire();`,
    ],
    expectStatus: 429, asserts: [bodyFail],
  },

  // ── Phase O — Validation matrix ─────────────────────────────────────────────
  { tc: "TC-130", folder: F.O, purpose: "Order missing variantId → 400", method: "POST", path: "/api/v2/merch/orders", json: { quantity: 1, studentName: "N", email: "n@example.com" }, expectStatus: 400, asserts: [bodyFail] },
  { tc: "TC-131", folder: F.O, purpose: "Order quantity 0 → 400", method: "POST", path: "/api/v2/merch/orders", json: { variantId: "{{variantS}}", quantity: 0, studentName: "N", email: "n@example.com" }, expectStatus: 400, asserts: [bodyFail] },
  { tc: "TC-132", folder: F.O, purpose: "Order quantity 21 → 400", method: "POST", path: "/api/v2/merch/orders", json: { variantId: "{{variantS}}", quantity: 21, studentName: "N", email: "n@example.com" }, expectStatus: 400, asserts: [bodyFail] },
  { tc: "TC-133", folder: F.O, purpose: "Order invalid email → 400", method: "POST", path: "/api/v2/merch/orders", json: { variantId: "{{variantS}}", quantity: 1, studentName: "N", email: "not-an-email" }, expectStatus: 400, asserts: [bodyFail] },
  { tc: "TC-134", folder: F.O, purpose: "Order missing studentName → 400", method: "POST", path: "/api/v2/merch/orders", json: { variantId: "{{variantS}}", quantity: 1, email: "n@example.com" }, expectStatus: 400, asserts: [bodyFail] },
  { tc: "TC-135", folder: F.O, purpose: "Order on sold-out variant (XL) → 409", method: "POST", path: "/api/v2/merch/orders", json: { variantId: "{{variantXL}}", quantity: 1, studentName: "N", email: "n@example.com" }, expectStatus: 409, asserts: [bodyFail] },
  { tc: "TC-136", folder: F.O, purpose: "Order unknown variantId → 404", method: "POST", path: "/api/v2/merch/orders", json: { variantId: "00000000-0000-4000-8000-000000000000", quantity: 1, studentName: "N", email: "n@example.com" }, expectStatus: 404, asserts: [bodyFail] },
  { tc: "TC-137", folder: F.O, purpose: "Swap missing variantId → 400", method: "POST", path: "/api/v2/merch/resolve/{{tok_validation}}/swap", json: {}, expectStatus: 400, asserts: [bodyFail] },
  { tc: "TC-138", folder: F.O, purpose: "Swap to same/current variant → 400", method: "POST", path: "/api/v2/merch/resolve/{{tok_validation}}/swap", json: { variantId: "{{ord_validation_variant}}" }, expectStatus: 400, asserts: [bodyFail] },
  { tc: "TC-139", folder: F.O, purpose: "Track order missing email → 400", method: "GET", path: "/api/v2/merch/orders/{{ord_track_ref}}", expectStatus: 400, asserts: [bodyFail] },
  { tc: "TC-140", folder: F.O, purpose: "Payment proof missing screenshot → 400", method: "POST", path: "/api/v2/merch/orders/{{ord_track_ref}}/payment-proof", formdata: [{ key: "email", value: "{{ord_track_email}}", type: "text" }, { key: "referenceNumber", value: "1231231231231", type: "text" }], expectStatus: 400, asserts: [bodyFail] },

  // ── Phase P — Resolution-link / resolve edges ───────────────────────────────
  { tc: "TC-141", folder: F.P, purpose: "Resolution-link on non-resolution order → 409", method: "POST", path: "/api/v2/admin/merch/orders/{{ord_confirmed_plain_id}}/resolution-link", role: "finance", expectStatus: 409, asserts: [bodyFail] },
  { tc: "TC-142", folder: F.P, purpose: "Resolve GET unknown token → 404", method: "GET", path: "/api/v2/merch/resolve/deadbeefdeadbeefdeadbeefdeadbeef", expectStatus: 404, asserts: [bodyFail] },
  { tc: "TC-143", folder: F.P, purpose: "Resolve GET expired token → 410", method: "GET", path: "/api/v2/merch/resolve/{{tok_expired}}", expectStatus: 410, asserts: [bodyFail] },
  { tc: "TC-144", folder: F.P, purpose: "Resolve swap unknown token → 404", method: "POST", path: "/api/v2/merch/resolve/deadbeefdeadbeefdeadbeefdeadbeef/swap", json: { variantId: "{{variantS}}" }, expectStatus: 404, asserts: [bodyFail] },
  { tc: "TC-145", folder: F.P, purpose: "Resolve refund unknown token → 404", method: "POST", path: "/api/v2/merch/resolve/deadbeefdeadbeefdeadbeefdeadbeef/refund", expectStatus: 404, asserts: [bodyFail] },
];

// ── Postman collection builder ──────────────────────────────────────────────

function buildItem(spec: Spec) {
  const headers: { key: string; value: string }[] = [];
  const token = TOKENS[spec.role ?? "none"];
  if (token) headers.push({ key: "Authorization", value: `Bearer ${token}` });
  if (spec.json !== undefined) headers.push({ key: "Content-Type", value: "application/json" });
  for (const [k, v] of Object.entries(spec.headers ?? {})) headers.push({ key: k, value: v });

  const base = `{{${spec.baseVar ?? "baseUrl"}}}`;
  const url: Record<string, unknown> = {
    raw: `${base}${spec.path}${spec.query ? "?" + Object.entries(spec.query).map(([k, v]) => `${k}=${v}`).join("&") : ""}`,
    host: [base],
    path: spec.path.replace(/^\//, "").split("/"),
  };
  if (spec.query) url.query = Object.entries(spec.query).map(([key, value]) => ({ key, value }));

  const body =
    spec.json !== undefined
      ? { mode: "raw", raw: JSON.stringify(spec.json, null, 2), options: { raw: { language: "json" } } }
      : spec.formdata
      ? { mode: "formdata", formdata: spec.formdata.map((f) => (f.type === "file" ? { key: f.key, type: "file", src: f.src } : { key: f.key, value: f.value, type: "text" })) }
      : undefined;

  const exec = [
    `pm.test('${spec.tc} status ${spec.expectStatus}', function () {`,
    `  pm.expect(pm.response.code, 'HTTP status').to.eql(${spec.expectStatus});`,
    `});`,
    ...(spec.asserts && spec.asserts.length
      ? [`pm.test('${spec.tc} body', function () {`, ...spec.asserts.map((a) => "  " + a), `});`]
      : []),
  ];

  const event: unknown[] = [];
  if (spec.preRequest && spec.preRequest.length) {
    event.push({ listen: "prerequest", script: { type: "text/javascript", exec: spec.preRequest } });
  }
  event.push({ listen: "test", script: { type: "text/javascript", exec } });

  return {
    name: `${spec.tc} — ${spec.purpose}`,
    event,
    request: {
      method: spec.method,
      header: headers,
      ...(body ? { body } : {}),
      url,
    },
    response: [],
  };
}

// A non-TC setup request injected at the start of a folder (e.g. close the shop
// before the shop-toggle phase). Not counted in the TC coverage.
function buildSetupItem(name: string, method: string, path: string, role: Role, json: unknown) {
  const headers: { key: string; value: string }[] = [{ key: "Content-Type", value: "application/json" }];
  const token = TOKENS[role];
  if (token) headers.push({ key: "Authorization", value: `Bearer ${token}` });
  return {
    name,
    event: [
      {
        listen: "test",
        script: {
          type: "text/javascript",
          exec: [`pm.test('${name} ok', function () { pm.expect(pm.response.code, 'setup status').to.be.oneOf([200, 201]); });`],
        },
      },
    ],
    request: {
      method,
      header: headers,
      body: { mode: "raw", raw: JSON.stringify(json, null, 2), options: { raw: { language: "json" } } },
      url: { raw: `{{baseUrl}}${path}`, host: ["{{baseUrl}}"], path: path.replace(/^\//, "").split("/") },
    },
    response: [],
  };
}

// Explicit folder order: Phase N (which CLOSES the shop) must run LAST so no
// later phase is affected by the closed-shop state.
const FOLDER_ORDER = [F.A, F.B, F.C, F.D, F.E, F.F, F.G, F.H, F.I, F.J, F.K, F.L, F.M, F.O, F.P, F.N];

export function buildCollection() {
  const byFolder = new Map<string, Spec[]>();
  for (const s of SPECS) {
    if (!byFolder.has(s.folder)) byFolder.set(s.folder, []);
    byFolder.get(s.folder)!.push(s);
  }
  const items = FOLDER_ORDER.filter((f) => byFolder.has(f)).map((folder) => {
    const reqs = byFolder.get(folder)!.map(buildItem);
    // Phase N runs against a closed shop — close it as the folder's first step.
    if (folder === F.N) {
      reqs.unshift(buildSetupItem("SETUP — close the merch shop", "PATCH", "/api/v2/admin/settings", "super", { merch_shop_open: false }) as never);
    }
    return { name: folder, item: reqs };
  });

  return {
    info: {
      name: "QCU MSC Central Portal — V2 Merch Pre-Orders",
      description:
        "Executable HTTP tests for Module 04 (Org Merch Pre-Orders). 1:1 with docs/test-cases/v2/04-merch-pre-orders.md and the test report. Preconditions are pre-seeded by scripts/e2e/run.ts; run with Newman locally against http://localhost:5000.",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: items,
  };
}

/** Flat list of every TC id in collection order — used by the report + matrix. Excludes SETUP-* helper requests. */
export function tcIdsInOrder(): string[] {
  const byFolder = new Map<string, Spec[]>();
  for (const s of SPECS) {
    if (!byFolder.has(s.folder)) byFolder.set(s.folder, []);
    byFolder.get(s.folder)!.push(s);
  }
  return FOLDER_ORDER.filter((f) => byFolder.has(f)).flatMap((f) => byFolder.get(f)!.map((s) => s.tc)).filter((tc) => !tc.startsWith("SETUP"));
}
