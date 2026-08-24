/**
 * End-to-end harness for Module 04 — Org Merch Pre-Orders (V2).
 *
 * Owns the whole local run:
 *   1. (re)starts two API servers — main (:5000, relaxed rate limit) and a
 *      dedicated no-GCASH server (:5051, REAL limits) for the 503/429 cases;
 *   2. cleans merch tables + promotes two finance roles + logs every role in
 *      (captures bearer tokens from the `set-auth-token` header);
 *   3. pre-seeds every TC precondition via the REAL API (+ a little Prisma for
 *      time-travel on aged rows/tokens), exposing concrete ids/refs/tokens;
 *   4. writes the Postman collection + environment JSON to /postman;
 *   5. runs the collection with Newman and writes the raw results to
 *      scripts/e2e/out/newman-results.json.
 *
 * Run: npx tsx scripts/e2e/run.ts
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import newman from "newman";
import { prisma } from "../../src/config/database";
import { pngFixture, pdfFixture } from "../../src/__tests__/helpers";
import { buildCollection } from "./collection";

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "scripts", "e2e", "out");
const FIX = path.join(ROOT, "scripts", "e2e", "fixtures");
const POSTMAN = path.join(ROOT, "postman");

const MAIN_PORT = 5000;
const NOGCASH_PORT = 5051;
const BASE = `http://localhost:${MAIN_PORT}`;
const BASE_NOGCASH = `http://localhost:${NOGCASH_PORT}`;

const servers: ChildProcess[] = [];
const env: Record<string, string> = {};
let refCounter = 1_000_000_000_000;
const nextRef = () => String(++refCounter);

// ── small utils ─────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function log(msg: string) {
  console.log(`[e2e] ${msg}`);
}

async function killPort(port: number) {
  await new Promise<void>((resolve) => {
    const p = spawn(
      "powershell.exe",
      ["-Command", `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`],
      { stdio: "ignore" }
    );
    p.on("exit", () => resolve());
    p.on("error", () => resolve());
  });
}

async function waitForHealth(base: string, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${base}/api/v2/merch`);
      if (res.status === 200 || res.status === 503) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error(`server ${base} did not become healthy in ${timeoutMs}ms`);
}

function startServer(port: number, extraEnv: Record<string, string>, logFile: string, deleteKeys: string[] = []): ChildProcess {
  const out = fs.openSync(logFile, "w");
  const childEnv: Record<string, string | undefined> = { ...process.env, PORT: String(port), ...extraEnv };
  // The parent loaded .env (importing prisma), so process.env already holds e.g.
  // GCASH_*. Delete inherited keys the child must NOT see (dotenv won't override
  // an existing key, so inheritance would otherwise defeat the stripped env file).
  for (const k of deleteKeys) delete childEnv[k];
  const child = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: ROOT,
    env: childEnv,
    stdio: ["ignore", out, out],
    shell: true,
  });
  servers.push(child);
  return child;
}

interface Res {
  status: number;
  data: any;
  headers: Headers;
}

async function req(method: string, url: string, opts: { token?: string; json?: unknown } = {}): Promise<Res> {
  const headers: Record<string, string> = {};
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  let body: string | undefined;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  }
  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

async function login(portal: "admin" | "student", email: string, password: string): Promise<string> {
  // Better Auth enforces a CSRF Origin check against trustedOrigins (FRONTEND_URL
  // / ADMIN_FRONTEND_URL). Send the matching portal origin or sign-in 403s with
  // MISSING_OR_NULL_ORIGIN.
  const origin =
    portal === "admin"
      ? process.env.ADMIN_FRONTEND_URL || "http://localhost:8081"
      : process.env.FRONTEND_URL || "http://localhost:5173";
  const res = await fetch(`${BASE}/api/v1/auth/${portal}/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email, password }),
  });
  const token = res.headers.get("set-auth-token");
  if (!token) throw new Error(`login failed for ${email}: ${res.status} ${await res.text()}`);
  return token;
}

// ── merch API helpers ───────────────────────────────────────────────────────
let tokFinance = "";
let tokHead = "";

async function createItem(name: string, price: number, variants: unknown, opts: { token?: string } = {}) {
  const fd = new FormData();
  fd.set("name", name);
  fd.set("description", `${name} — e2e fixture`);
  fd.set("price", String(price));
  fd.set("variants", JSON.stringify(variants));
  fd.append("photos", new Blob([pngFixture], { type: "image/png" }), "photo.png");
  const res = await fetch(`${BASE}/api/v2/admin/merch/items`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.token ?? tokFinance}` },
    body: fd,
  });
  const data: any = await res.json();
  if (res.status !== 201) throw new Error(`createItem ${res.status}: ${JSON.stringify(data)}`);
  return data.data.item as { id: string; variants: { id: string; label: string }[] };
}

async function archiveItem(itemId: string) {
  const r = await req("POST", `${BASE}/api/v2/admin/merch/items/${itemId}/archive`, { token: tokHead });
  if (r.status !== 200) throw new Error(`archive ${r.status}: ${JSON.stringify(r.data)}`);
}

async function orderIdFromRef(orderRef: string): Promise<string> {
  const o = await prisma.merchOrder.findUnique({ where: { orderRef }, select: { id: true } });
  if (!o) throw new Error(`no order for ref ${orderRef}`);
  return o.id;
}

async function createOrder(variantId: string, email: string, opts: { quantity?: number; name?: string } = {}) {
  const r = await req("POST", `${BASE}/api/v2/merch/orders`, {
    json: { variantId, quantity: opts.quantity ?? 1, studentName: opts.name ?? "E2E Buyer", email },
  });
  if (r.status !== 201) throw new Error(`createOrder ${r.status}: ${JSON.stringify(r.data)}`);
  const orderRef = r.data.data.orderRef as string;
  const id = await orderIdFromRef(orderRef);
  return { orderRef, id, email };
}

async function payProof(orderRef: string, email: string, ref = nextRef()) {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("referenceNumber", ref);
  fd.append("screenshot", new Blob([pngFixture], { type: "image/png" }), "proof.png");
  const res = await fetch(`${BASE}/api/v2/merch/orders/${orderRef}/payment-proof`, { method: "POST", body: fd });
  const data: any = await res.json().catch(() => ({}));
  if (res.status !== 200) throw new Error(`payProof ${res.status}: ${JSON.stringify(data)}`);
  return ref;
}

async function reject(orderId: string, json: unknown) {
  const r = await req("POST", `${BASE}/api/v2/admin/merch/orders/${orderId}/reject`, { token: tokFinance, json });
  if (r.status !== 200) throw new Error(`reject ${r.status}: ${JSON.stringify(r.data)}`);
}

async function confirm(orderId: string) {
  const r = await req("POST", `${BASE}/api/v2/admin/merch/orders/${orderId}/confirm`, { token: tokFinance });
  return r;
}

async function claim(orderId: string) {
  const r = await req("POST", `${BASE}/api/v2/admin/merch/orders/${orderId}/claim`, { token: tokFinance });
  if (r.status !== 200) throw new Error(`claim ${r.status}: ${JSON.stringify(r.data)}`);
}

async function mintToken(orderId: string): Promise<string> {
  const r = await req("POST", `${BASE}/api/v2/admin/merch/orders/${orderId}/resolution-link`, { token: tokFinance });
  if (r.status !== 200) throw new Error(`mintToken ${r.status}: ${JSON.stringify(r.data)}`);
  const swapUrl: string = r.data.data.swapUrl;
  return swapUrl.split("/resolve/")[1].split("?")[0];
}

/** Drive a fresh order to AWAITING_RESOLUTION via the reject-OUT_OF_STOCK route. */
async function toResolution(variantId: string, email: string) {
  const o = await createOrder(variantId, email);
  await payProof(o.orderRef, email);
  await reject(o.id, { reason: "OUT_OF_STOCK" });
  return o;
}

async function swap(token: string, variantId: string, acknowledgedTopUp = false) {
  const r = await req("POST", `${BASE}/api/v2/merch/resolve/${token}/swap`, { json: { variantId, acknowledgedTopUp } });
  return r;
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  for (const d of [OUT, FIX, POSTMAN]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(FIX, "photo.png"), pngFixture);
  fs.writeFileSync(path.join(FIX, "proof.png"), pngFixture);
  fs.writeFileSync(path.join(FIX, "bad.pdf"), pdfFixture);

  log("stopping any servers on :5000 / :5051 …");
  await killPort(MAIN_PORT);
  await killPort(NOGCASH_PORT);
  await sleep(1500);

  // The no-GCASH server needs a .env WITHOUT the GCASH keys — dotenv-expand
  // re-injects .env values over spawn-env overrides, so a stripped env file
  // (via DOTENV_CONFIG_PATH) is the reliable way to unset them. Written to the
  // pre-approved temp dir so no secrets land in the repo.
  const tmpDir = "C:\\Users\\busti\\AppData\\Local\\Temp\\opencode";
  fs.mkdirSync(tmpDir, { recursive: true });
  const noGcashEnvPath = path.join(tmpDir, ".env.nogcash");
  const baseEnvText = fs.existsSync(path.join(ROOT, ".env")) ? fs.readFileSync(path.join(ROOT, ".env"), "utf8") : "";
  const strippedEnv = baseEnvText
    .split(/\r?\n/)
    .filter((line) => !/^\s*GCASH_NUMBER\s*=/.test(line) && !/^\s*GCASH_QR_IMAGE_URL\s*=/.test(line))
    .join("\n");
  fs.writeFileSync(noGcashEnvPath, strippedEnv);

  log("starting main server (:5000, relaxed rate limit) …");
  startServer(MAIN_PORT, { E2E_RELAX_RATELIMIT: "true", NODE_ENV: "development" }, path.join(OUT, "server-main.log"));
  log("starting no-GCASH server (:5051, real limits) …");
  startServer(NOGCASH_PORT, { NODE_ENV: "development", DOTENV_CONFIG_PATH: noGcashEnvPath }, path.join(OUT, "server-nogcash.log"), ["GCASH_NUMBER", "GCASH_QR_IMAGE_URL"]);
  await waitForHealth(BASE);
  await waitForHealth(BASE_NOGCASH);
  log("both servers healthy.");

  // ── clean merch tables ──────────────────────────────────────────────────
  log("cleaning merch tables …");
  await prisma.merchOrderResolutionToken.deleteMany({});
  await prisma.merchRefund.deleteMany({});
  await prisma.paymentProofSubmission.deleteMany({});
  await prisma.merchOrder.deleteMany({});
  await prisma.merchVariant.deleteMany({});
  await prisma.merchItem.deleteMany({});

  // ── promote finance roles ─────────────────────────────────────────────────
  log("promoting finance roles …");
  // Idempotent across runs: reuse any already-promoted finance users or admins
  // (all sign in via the admin portal with the seeded ADMIN_PASSWORD).
  const admins = await prisma.user.findMany({
    where: { role: { in: ["ADMIN_HR", "ADMIN_FINANCE", "ADMIN_FINANCE_HEAD"] } },
    select: { id: true, email: true },
    orderBy: { email: "asc" },
    take: 2,
  });
  if (admins.length < 2) throw new Error("need ≥2 admin-portal seed users to promote to finance");
  await prisma.user.update({ where: { id: admins[0].id }, data: { role: "ADMIN_FINANCE" } });
  await prisma.user.update({ where: { id: admins[1].id }, data: { role: "ADMIN_FINANCE_HEAD" } });
  const financeEmail = admins[0].email;
  const headEmail = admins[1].email;
  const member = await prisma.user.findFirst({ where: { role: "MEMBER" }, select: { email: true } });
  if (!member) throw new Error("need a MEMBER seed user");

  // ── login every role ──────────────────────────────────────────────────────
  log("logging in roles …");
  tokFinance = await login("admin", financeEmail, "Password123!");
  tokHead = await login("admin", headEmail, "Password123!");
  const tokMember = await login("student", member.email, "Password123!");
  const tokSuper = await login("admin", "superadmin@msc-qcu.tech", "SuperAdminPass123!");

  // ── open the shop ───────────────────────────────────────────────────────
  const openRes = await req("PATCH", `${BASE}/api/v2/admin/settings`, { token: tokSuper, json: { merch_shop_open: true } });
  if (openRes.status !== 200) throw new Error(`open shop ${openRes.status}: ${JSON.stringify(openRes.data)}`);
  log("shop opened.");

  // ── catalog items ─────────────────────────────────────────────────────────
  log("seeding catalog …");
  const mainItem = await createItem("MSC Shirt", 350, [
    { label: "S", stock: 50, price: 300 }, // cheaper
    { label: "M", stock: 50 }, // base 350
    { label: "L", stock: 50, price: 400 }, // pricier
    { label: "XL", stock: 0, price: 400 }, // sold out
  ]);
  const vId = (label: string) => mainItem.variants.find((v) => v.label === label)!.id;
  const itemRow = await prisma.merchItem.findUnique({ where: { id: mainItem.id }, select: { photos: true } });
  const photoFile = (itemRow!.photos as string[])[0];

  const archived = await createItem("Archived Hoodie", 500, [{ label: "M", stock: 3 }]);
  await archiveItem(archived.id);
  const archive2 = await createItem("To Be Archived", 200, [{ label: "M", stock: 3 }]);
  const editItem = await createItem("Editable Cap", 250, [{ label: "S", stock: 5 }]);
  const oversell = await createItem("Limited Pin", 350, [{ label: "OneSize", stock: 1 }]);
  const oversellVid = oversell.variants[0].id;

  Object.assign(env, {
    itemId: mainItem.id,
    variantS: vId("S"),
    variantM: vId("M"),
    variantL: vId("L"),
    variantXL: vId("XL"),
    photoFile,
    itemArchivedId: archived.id,
    itemArchive2Id: archive2.id,
    itemEditId: editItem.id,
  });

  // ── Phase B fixtures ────────────────────────────────────────────────────
  log("seeding orders …");
  const track = await createOrder(vId("S"), "track@example.com");
  Object.assign(env, { ord_track_ref: track.orderRef, ord_track_email: track.email });

  const pp = await createOrder(vId("S"), "pp@example.com");
  Object.assign(env, { ord_pp_ref: pp.orderRef, ord_pp_email: pp.email, ref_pp: nextRef() });

  const confirmOrd = await createOrder(vId("S"), "confirm@example.com");
  await payProof(confirmOrd.orderRef, confirmOrd.email);
  env.ord_confirm_id = confirmOrd.id;
  // capture a real proof filename (exists on disk) for the screenshot proxy
  const sub = await prisma.paymentProofSubmission.findFirst({ where: { orderId: confirmOrd.id }, select: { screenshotPath: true } });
  env.proofFile = sub!.screenshotPath;

  const claimOrd = await createOrder(vId("S"), "claim@example.com");
  await payProof(claimOrd.orderRef, claimOrd.email);
  await confirm(claimOrd.id);
  env.ord_claim_id = claimOrd.id;

  // ── Phase C fixtures (each PENDING_VERIFICATION) ──────────────────────────
  const pending = async (email: string) => {
    const o = await createOrder(vId("S"), email);
    await payProof(o.orderRef, o.email);
    return o;
  };
  env.ord_rej_ref_id = (await pending("rejref@example.com")).id;
  env.ord_rej_scr_id = (await pending("rejscr@example.com")).id;
  env.ord_rej_other_nonote_id = (await pending("rejother0@example.com")).id;
  env.ord_rej_other_id = (await pending("rejother@example.com")).id;
  env.ord_rej_am_noamt_id = (await pending("rejam0@example.com")).id;
  const am = await pending("rejam@example.com");
  Object.assign(env, { ord_rej_am_id: am.id, ord_rej_am_ref: am.orderRef, ord_rej_am_email: am.email, ref_tc25: nextRef() });
  env.ord_rej_am_high_id = (await pending("rejamhigh@example.com")).id;
  env.ord_rej_am_badreason_id = (await pending("rejambad@example.com")).id;

  // ── Phase D fixtures ──────────────────────────────────────────────────────
  // Real oversell race on the stock-1 item.
  const os1 = await createOrder(oversellVid, "os1@example.com");
  await payProof(os1.orderRef, os1.email);
  const os2 = await createOrder(oversellVid, "os2@example.com");
  await payProof(os2.orderRef, os2.email);
  Object.assign(env, { ord_os1_id: os1.id, ord_os2_id: os2.id });

  env.ord_reject_oos_id = (await pending("rejectoos@example.com")).id;

  env.ord_res_link_id = (await toResolution(vId("M"), "reslink@example.com")).id;

  const resGet = await toResolution(vId("M"), "resget@example.com");
  env.tok_res_get = await mintToken(resGet.id);

  const swapNoack = await toResolution(vId("M"), "swapnoack@example.com");
  env.tok_swap_noack = await mintToken(swapNoack.id);

  const swapPricier = await toResolution(vId("M"), "swappricier@example.com");
  Object.assign(env, { ord_swap_pricier_id: swapPricier.id, ord_swap_pricier_ref: swapPricier.orderRef, ord_swap_pricier_email: swapPricier.email, ref_topup: nextRef() });
  env.tok_swap_pricier = await mintToken(swapPricier.id);

  const swapCheaper = await toResolution(vId("M"), "swapcheaper@example.com");
  env.tok_swap_cheaper = await mintToken(swapCheaper.id);

  const refundReq = await toResolution(vId("M"), "refundreq@example.com");
  env.tok_refund = await mintToken(refundReq.id);

  const swapSoldout = await toResolution(vId("M"), "swapsoldout@example.com");
  env.tok_swap_soldout = await mintToken(swapSoldout.id);

  // ── Phase E fixtures ──────────────────────────────────────────────────────
  env.ord_refund_full_id = (await toResolution(vId("M"), "refundfull@example.com")).id;
  env.ord_refund_other_id = (await toResolution(vId("M"), "refundother@example.com")).id;
  env.ord_refund_over_id = (await toResolution(vId("M"), "refundover@example.com")).id;

  // price-difference: cheaper swap → CONFIRMED + refundOwed 50
  const priceDiff = await toResolution(vId("M"), "pricediff@example.com");
  const pdTok = await mintToken(priceDiff.id);
  const pdSwap = await swap(pdTok, vId("S"));
  if (pdSwap.status !== 200) throw new Error(`pricediff swap ${pdSwap.status}: ${JSON.stringify(pdSwap.data)}`);
  env.ord_pricediff_id = priceDiff.id;

  // a plain CONFIRMED order that owes nothing (reused by many negative cases)
  const plain = await createOrder(vId("S"), "plain@example.com");
  await payProof(plain.orderRef, plain.email);
  await confirm(plain.id);
  env.ord_confirmed_plain_id = plain.id;

  // ── Phase F fixtures ──────────────────────────────────────────────────────
  const resend = await createOrder(vId("S"), "resend@example.com");
  await payProof(resend.orderRef, resend.email);
  await confirm(resend.id);
  env.ord_resend_id = resend.id;

  // an order that still owes a swap difference at Phase F time (never refunded)
  const owes = await toResolution(vId("M"), "owes@example.com");
  const owesTok = await mintToken(owes.id);
  await swap(owesTok, vId("S")); // cheaper → refundOwed 50

  // overdue top-up: pricier swap → AWAITING_PAYMENT + shortfall, aged 8 days
  const overdue = await toResolution(vId("M"), "overdue@example.com");
  const overdueTok = await mintToken(overdue.id);
  const odSwap = await swap(overdueTok, vId("L"), true);
  if (odSwap.status !== 200) throw new Error(`overdue swap ${odSwap.status}: ${JSON.stringify(odSwap.data)}`);
  await prisma.$executeRawUnsafe(
    `UPDATE \`MerchOrder\` SET updatedAt = DATE_SUB(NOW(), INTERVAL 8 DAY) WHERE id = ?`,
    overdue.id
  );
  env.overdueOrderRef = overdue.orderRef;

  // ── Phase J fixtures ──────────────────────────────────────────────────────
  const cancelConfirmed = await createOrder(vId("S"), "cancelc@example.com");
  await payProof(cancelConfirmed.orderRef, cancelConfirmed.email);
  await confirm(cancelConfirmed.id);
  env.ord_cancel_confirmed_id = cancelConfirmed.id;
  env.ord_cancel_awaiting_id = (await createOrder(vId("S"), "cancela@example.com")).id;
  env.ord_cancel_awaiting2_id = (await createOrder(vId("S"), "cancela2@example.com")).id;

  const claimed = await createOrder(vId("S"), "claimed@example.com");
  await payProof(claimed.orderRef, claimed.email);
  await confirm(claimed.id);
  await claim(claimed.id);
  env.ord_claimed_id = claimed.id;

  env.ord_awaiting_res_id = (await toResolution(vId("M"), "awaitingres@example.com")).id;

  // ── Phase G fixtures ──────────────────────────────────────────────────────
  // duplicate reference: dupA pays ref_dup (accepted), dupB submits same → 409
  const refDup = nextRef();
  const dupA = await createOrder(vId("S"), "dupa@example.com");
  await payProof(dupA.orderRef, dupA.email, refDup);
  const dupB = await createOrder(vId("S"), "dupb@example.com");
  Object.assign(env, { ref_dup: refDup, ord_dupB_ref: dupB.orderRef, ord_dupB_email: dupB.email });

  // PDF / bad-ref order (stays AWAITING_PAYMENT — both attempts fail validation)
  const pdf = await createOrder(vId("S"), "pdf@example.com");
  Object.assign(env, { ord_pdf_ref: pdf.orderRef, ord_pdf_email: pdf.email, ref_pdf: nextRef() });

  // ── Phase H fixture: resolved order + token (TC-65) ───────────────────────
  const resolved = await toResolution(vId("M"), "resolved@example.com");
  env.tok_resolved = await mintToken(resolved.id);
  // take it out of AWAITING_RESOLUTION via a full refund (head)
  const fullRef = await req("POST", `${BASE}/api/v2/admin/merch/orders/${resolved.id}/refund`, {
    token: tokHead,
    json: { amount: 350, method: "GCASH" },
  });
  if (fullRef.status !== 200) throw new Error(`resolved refund ${fullRef.status}: ${JSON.stringify(fullRef.data)}`);

  // ── Phase N fixture: token for shop-closed resolve (TC-128) ───────────────
  env.tok_shopclosed = await mintToken((await toResolution(vId("M"), "shopclosed@example.com")).id);

  // ── Phase O / P fixtures ──────────────────────────────────────────────────
  const validation = await toResolution(vId("M"), "validation@example.com");
  env.tok_validation = await mintToken(validation.id);
  env.ord_validation_variant = vId("M"); // current variant → swap-to-same 400

  // expired token
  const expired = await toResolution(vId("M"), "expired@example.com");
  const expiredTok = await mintToken(expired.id);
  const expiredHash = createHash("sha256").update(expiredTok).digest("hex");
  await prisma.merchOrderResolutionToken.update({
    where: { tokenHash: expiredHash },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });
  env.tok_expired = expiredTok;

  // ── static env values ─────────────────────────────────────────────────────
  Object.assign(env, {
    baseUrl: BASE,
    baseUrlNoGcash: BASE_NOGCASH,
    tok_finance: tokFinance,
    tok_head: tokHead,
    tok_member: tokMember,
    tok_super: tokSuper,
    fixturePng: path.join(FIX, "photo.png"),
    fixturePdf: path.join(FIX, "bad.pdf"),
  });

  // ── write collection + environment ────────────────────────────────────────
  const collection = buildCollection();
  const collectionPath = path.join(POSTMAN, "QCU-MSC-Merch-PreOrders.postman_collection.json");
  fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2));

  const environment = {
    id: "merch-e2e-env",
    name: "QCU MSC Merch Pre-Orders — E2E (local)",
    values: Object.entries(env).map(([key, value]) => ({ key, value: String(value), enabled: true, type: "default" })),
    _postman_variable_scope: "environment",
  };
  const envPath = path.join(POSTMAN, "QCU-MSC-Merch-PreOrders.postman_environment.json");
  // Do NOT commit tokens/run-specific ids: the runtime copy (with real values)
  // lives in /out (gitignored); the committed copy is a blank TEMPLATE showing
  // the variable set, with only the base URLs defaulted.
  const runtimeEnvPath = path.join(OUT, "merch-e2e-environment.runtime.json");
  fs.writeFileSync(runtimeEnvPath, JSON.stringify(environment, null, 2));
  const template = {
    id: "merch-e2e-env-template",
    name: "QCU MSC Merch Pre-Orders — E2E (template)",
    values: environment.values.map((v) =>
      v.key === "baseUrl"
        ? { ...v, value: BASE }
        : v.key === "baseUrlNoGcash"
        ? { ...v, value: BASE_NOGCASH }
        : { ...v, value: "" }
    ),
    _postman_variable_scope: "environment",
  };
  fs.writeFileSync(envPath, JSON.stringify(template, null, 2));
  log(`wrote collection (${collectionPath}) + environment template.`);

  // ── run newman ──────────────────────────────────────────────────────────
  log("running Newman …");
  await new Promise<void>((resolve, reject) => {
    newman.run(
      {
        collection: collectionPath,
        environment: runtimeEnvPath,
        reporters: ["cli", "json"],
        reporter: { json: { export: path.join(OUT, "newman-results.json") } },
        timeoutRequest: 20_000,
        bail: false,
      },
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
  log("Newman run complete → scripts/e2e/out/newman-results.json");
}

main()
  .catch((e) => {
    console.error("[e2e] FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
    for (const s of servers) s.kill();
    // give children a beat to die
    await sleep(500);
    log("done (servers stopped).");
    process.exit(process.exitCode ?? 0);
  });
