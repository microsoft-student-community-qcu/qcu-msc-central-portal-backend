# Module 04 (M2) — Org Merch Pre-Orders — Test Report

> Actual execution results for every test case in `04-merch-pre-orders.md`, produced by
> running the Postman collection with **Newman** against a live local server. Regenerate with
> `npx tsx scripts/e2e/run.ts && npx tsx scripts/e2e/report.ts`.

## Run metadata

| | |
|---|---|
| Generated | 2026-08-24 15:19:24 UTC |
| Runner | Newman (local) against `http://localhost:5000` + `:5051` (no-GCASH) |
| Collection | `postman/QCU-MSC-Merch-PreOrders.postman_collection.json` |
| Branch | `feat/v2-merch` · DB `qcu_msc_central_portal_dev` (reset + seeded per run) |
| Node env | `development` (local image fallback; SMTP sends to `@example.com` fail-soft) |

## Executive summary

- **Test cases (requests): 157** — **PASS 157 · FAIL 0**.
- **Assertions: 289 — failed 0.**
- **Endpoint coverage: 23/23** Pre-Order endpoints (9 public + 14 admin).
- **Email copy:** verified by `src/__tests__/merch.email.test.ts` (10 rendered-HTML assertions, all pass).
- **Verdict:** ✅ **READY for QA** — every endpoint and edge case passes.

## Runners used

| Layer | Scope | Result |
|---|---|---|
| **Newman (local)** | All 157 HTTP requests, 1:1 with the collection | 157/157 pass |
| **Postman cloud (Monitor)** | Same collection, cloud runner — attempted once | 145/157 requests failed — **cannot reach `localhost`** (expected runner limitation, not an API failure) |
| **Vitest (email HTML)** | Rendered email copy the HTTP layer can't see | 10/10 pass |
| **Vitest (unit)** | `merch.routes.test.ts` mocked-Prisma suite | 56/56 pass |

## Defects found during testing & their resolution

The suite was iterated until green. The issues found (and fixed) along the way, classified:

| # | Symptom | Root cause | Classification | Resolution |
|---|---|---|---|---|
| D1 | 13 admin endpoints returned **403** for a **no-token** request (expected 401) | Admin merch routes used only role guards (`requireAdminFinance`/`Head`); no `requireAuth` layer, so unauthenticated → role guard → 403. Inconsistent with applicant admin routes (401). | **API implementation** (auth semantics) | Added `router.use(requireAuth)` to `merch-admin.routes.ts` → no-token now **401**, wrong-role **403**. Updated the unit-test mock. |
| D2 | TC-62 (GCASH-unset → 503) returned **201** | The 2nd server inherited `GCASH_*` from the parent `process.env`, and `dotenv-expand` re-injects `.env` values over spawn overrides. | **Test/config (harness)** | Added `DOTENV_CONFIG_PATH` support to `env.ts`; harness boots the no-GCASH server with a stripped env file **and** deletes the inherited keys. |
| D3 | TC-01 returned **404** | Test hit `GET /admin/merch/items/:id` — an endpoint that does not exist (there is no admin single-item route). | **Test case** (wrong endpoint) | Repointed TC-01 to the public item-detail endpoint. |
| D4 | TC-39 returned **409** | A pricier swap leaves the order `AWAITING_PAYMENT`; confirm requires `PENDING_VERIFICATION`. The top-up proof step was missing. | **Test case** (missing step) | Added `SETUP-39` (submit the ₱50 top-up proof) before the confirm. |

All four are resolved; the final run below is fully green. D1 is the only production-code change of consequence and is covered by TC-100–TC-117.

## Per-test results

Actual HTTP status + response snippet for **every** request, grouped by phase. ✅ = all assertions passed.

### Phase A — Catalog & per-variant pricing

| TC | Method | Path | Role | Exp | Act | Result | Response (truncated) |
|----|--------|------|------|-----|-----|--------|----------------------|
| TC-01 | GET | /api/v2/merch/568cdf08-09bd-474f-9deb-52b8eca00cfe | none | 200 | 200 | ✅ PASS | {"success":true,"data":{"item":{"id":"568cdf08-09bd-474f-9deb-52b8eca00cfe","name":"MSC Shirt","description":"MSC Shirt — e2e fixture","price":350,"photos":["http://localhost:5000/… |
| TC-02 | GET | /api/v2/merch | none | 200 | 200 | ✅ PASS | {"success":true,"data":{"items":[{"id":"4cc321a3-4090-4df2-9420-f8c65d5dec83","name":"Limited Pin","description":"Limited Pin — e2e fixture","price":350,"photos":["http://localhost… |
| TC-03 | GET | /api/v2/merch/photos/item-91dfe903-ac92-4c1e-aeae-a9fbecd18e25.png | none | 200 | 200 | ✅ PASS | (image/png, 70 bytes) |
| TC-04 | GET | /api/v2/merch/5306f188-0899-4f4c-af7d-4b779ec30c88 | none | 404 | 404 | ✅ PASS | {"success":false,"message":"Item not found"} |

### Phase B — Happy path (order → pay → confirm → claim)

| TC | Method | Path | Role | Exp | Act | Result | Response (truncated) |
|----|--------|------|------|-----|-----|--------|----------------------|
| TC-05 | POST | /api/v2/merch/orders | none | 201 | 201 | ✅ PASS | {"success":true,"data":{"orderRef":"MSC-MERCH-2026-0043","amount":300,"gcashNumber":"09393811802","gcashQrImageUrl":"https://res.cloudinary.com/dvn0iyh3v/image/upload/v1787317033/G… |
| TC-06 | POST | /api/v2/merch/orders | none | 201 | 201 | ✅ PASS | {"success":true,"data":{"orderRef":"MSC-MERCH-2026-0044","amount":400,"gcashNumber":"09393811802","gcashQrImageUrl":"https://res.cloudinary.com/dvn0iyh3v/image/upload/v1787317033/G… |
| TC-07 | GET | /api/v2/merch/orders/MSC-MERCH-2026-0001 | none | 200 | 200 | ✅ PASS | {"success":true,"data":{"order":{"orderRef":"MSC-MERCH-2026-0001","studentName":"E2E Buyer","studentId":null,"email":"track@example.com","itemName":"MSC Shirt","variantLabel":"S","… |
| TC-08 | POST | /api/v2/merch/orders/MSC-MERCH-2026-0002/payment-proof | none | 200 | 200 | ✅ PASS | {"success":true,"message":"Your payment proof has been received. Our Finance team will verify your payment shortly."} |
| TC-09 | POST | /api/v2/admin/merch/orders/fdb28a71-9806-460e-8029-721869717f10/confirm | finance | 200 | 200 | ✅ PASS | {"success":true,"message":"Payment confirmed. Stock updated and the student notified."} |
| TC-10 | POST | /api/v2/admin/merch/orders/a3cd29de-fbd6-4b17-bf47-25f1685fc5cd/claim | finance | 200 | 200 | ✅ PASS | {"success":true,"message":"Order marked as claimed. Receipt emailed to the student."} |

### Phase C — Rejections, dynamic emails & top-up

| TC | Method | Path | Role | Exp | Act | Result | Response (truncated) |
|----|--------|------|------|-----|-----|--------|----------------------|
| TC-15 | POST | /api/v2/admin/merch/orders/49ddbb2c-d819-4a8e-995c-529067c6e561/reject | finance | 200 | 200 | ✅ PASS | {"success":true,"message":"Order rejected and the student notified."} |
| TC-16 | POST | /api/v2/admin/merch/orders/cab42677-1de6-487e-a77a-8bd55830cd9e/reject | finance | 200 | 200 | ✅ PASS | {"success":true,"message":"Order rejected and the student notified."} |
| TC-17 | POST | /api/v2/admin/merch/orders/d175ef6b-d96e-46cf-8653-85689e826042/reject | finance | 400 | 400 | ✅ PASS | {"success":false,"message":"Validation error","errors":{"financeNote":["A note is required when the rejection reason is 'Other'"]}} |
| TC-18 | POST | /api/v2/admin/merch/orders/f9677fcb-e5c3-437b-9f6e-0dd9c5284932/reject | finance | 200 | 200 | ✅ PASS | {"success":true,"message":"Order rejected and the student notified."} |
| TC-19 | GET | /api/v2/admin/merch/orders/f9677fcb-e5c3-437b-9f6e-0dd9c5284932 | finance | 200 | 200 | ✅ PASS | {"success":true,"data":{"order":{"id":"f9677fcb-e5c3-437b-9f6e-0dd9c5284932","orderRef":"MSC-MERCH-2026-0008","studentName":"E2E Buyer","studentId":null,"email":"rejother@example.c… |
| TC-20 | POST | /api/v2/admin/merch/orders/a82380b1-3443-4bea-bb0c-84eacc04231d/reject | finance | 400 | 400 | ✅ PASS | {"success":false,"message":"Validation error","errors":{"shortfallAmount":["Enter the exact amount the student still needs to send"]}} |
| TC-21 | POST | /api/v2/admin/merch/orders/0daf6236-58ec-48d9-b8ae-8d6e8a5f7101/reject | finance | 200 | 200 | ✅ PASS | {"success":true,"message":"Order rejected and the student notified."} |
| TC-22 | GET | /api/v2/merch/orders/MSC-MERCH-2026-0010 | none | 200 | 200 | ✅ PASS | {"success":true,"data":{"order":{"orderRef":"MSC-MERCH-2026-0010","studentName":"E2E Buyer","studentId":null,"email":"rejam@example.com","itemName":"MSC Shirt","variantLabel":"S","… |
| TC-23 | POST | /api/v2/admin/merch/orders/a9b3a9d8-196b-493a-8f37-bf0fdf0f30b7/reject | finance | 400 | 400 | ✅ PASS | {"success":false,"message":"The shortfall must be less than the order total of ₱300.00."} |
| TC-24 | GET | /api/v2/admin/merch/orders/49ddbb2c-d819-4a8e-995c-529067c6e561 | finance | 200 | 200 | ✅ PASS | {"success":true,"data":{"order":{"id":"49ddbb2c-d819-4a8e-995c-529067c6e561","orderRef":"MSC-MERCH-2026-0005","studentName":"E2E Buyer","studentId":null,"email":"rejref@example.com… |
| TC-25 | POST | /api/v2/merch/orders/MSC-MERCH-2026-0010/payment-proof | none | 200 | 200 | ✅ PASS | {"success":true,"message":"Your payment proof has been received. Our Finance team will verify your payment shortly."} |
| TC-26 | POST | /api/v2/admin/merch/orders/e8fd5d18-2692-4f62-9c29-c428715cd011/reject | finance | 400 | 400 | ✅ PASS | {"success":false,"message":"Validation error","errors":{"shortfallAmount":["A shortfall amount only applies to an amount-mismatch rejection"]}} |

### Phase D — Oversell resolution (swap/refund)

| TC | Method | Path | Role | Exp | Act | Result | Response (truncated) |
|----|--------|------|------|-----|-----|--------|----------------------|
| TC-30 | POST | /api/v2/admin/merch/orders/8eb0d06f-8387-47f8-aa88-0cbff971e6e0/confirm | finance | 200 | 200 | ✅ PASS | {"success":true,"message":"Payment confirmed. Stock updated and the student notified."} |
| TC-31 | POST | /api/v2/admin/merch/orders/ae4f9947-4229-4dee-9e0b-1a77d946632a/confirm | finance | 409 | 409 | ✅ PASS | {"success":false,"message":"Stock ran out before this order could be confirmed. The order now awaits the student's resolution (swap or refund) and they have been notified."} |
| TC-32 | POST | /api/v2/admin/merch/orders/3822abe3-f18b-4412-9cac-4daa95f8ee51/reject | finance | 200 | 200 | ✅ PASS | {"success":true,"message":"The student has already paid, so this order was routed to the refund/replacement track instead of being rejected. The student has been notified."} |
| TC-33 | GET | /api/v2/admin/merch/orders/ae4f9947-4229-4dee-9e0b-1a77d946632a | finance | 200 | 200 | ✅ PASS | {"success":true,"data":{"order":{"id":"ae4f9947-4229-4dee-9e0b-1a77d946632a","orderRef":"MSC-MERCH-2026-0014","studentName":"E2E Buyer","studentId":null,"email":"os2@example.com","… |
| TC-34 | POST | /api/v2/admin/merch/orders/5c0c6242-788a-426e-9fb6-7f76ba3637e5/resolution-link | finance | 200 | 200 | ✅ PASS | {"success":true,"message":"A fresh resolution link was issued and emailed to the student.","data":{"swapUrl":"http://localhost:3000/merch/resolve/Ur2gLUSBfzHBSel6cZLQMdddIm0EZiOYpc… |
| TC-35 | GET | /api/v2/merch/resolve/7Pk9La8lPnnfPJi9fxKsOhuylugs1ya9PJJzBXB3SKs | none | 200 | 200 | ✅ PASS | {"success":true,"data":{"order":{"orderRef":"MSC-MERCH-2026-0017","itemName":"MSC Shirt","soldOutVariantLabel":"M","quantity":1,"amountPaid":350,"status":"AWAITING_RESOLUTION"},"op… |
| TC-36 | POST | /api/v2/merch/resolve/aj6PuQlbiOBx9Aqg8G94IT_ayg1pM0VdzodLMEXOiB4/swap | none | 409 | 409 | ✅ PASS | {"success":false,"message":"Switching to L costs ₱50.00 more. Please confirm you'll pay the difference to proceed.","data":{"requiresTopUp":true,"shortfall":50,"variantId":"480e071… |
| TC-37 | POST | /api/v2/merch/resolve/D4WwnJUmX1lvYPoXOTMTvswaBVWws0sPVgSTm59K_Hs/swap | none | 200 | 200 | ✅ PASS | {"success":true,"message":"Your new size is reserved. Please pay the difference and submit the reference number to confirm.","data":{"status":"AWAITING_PAYMENT","shortfall":50,"ref… |
| TC-38 | GET | /api/v2/merch/orders/MSC-MERCH-2026-0019 | none | 200 | 200 | ✅ PASS | {"success":true,"data":{"order":{"orderRef":"MSC-MERCH-2026-0019","studentName":"E2E Buyer","studentId":null,"email":"swappricier@example.com","itemName":"MSC Shirt","variantLabel"… |
| SETUP-39 | POST | /api/v2/merch/orders/MSC-MERCH-2026-0019/payment-proof | none | 200 | 200 | ✅ PASS | {"success":true,"message":"Your payment proof has been received. Our Finance team will verify your payment shortly."} |
| TC-39 | POST | /api/v2/admin/merch/orders/9a2a8132-ce91-4624-b5f0-ac32475d3d62/confirm | finance | 200 | 200 | ✅ PASS | {"success":true,"message":"Payment confirmed. Stock updated and the student notified."} |
| TC-40 | POST | /api/v2/merch/resolve/8b7jBonI_HwzMeG5MzfCd0gnT6zwLFAbAfflW9JyhgE/swap | none | 200 | 200 | ✅ PASS | {"success":true,"message":"Your order has been switched to the new size.","data":{"status":"CONFIRMED","shortfall":0,"refundOwed":50,"trackingUrl":"http://localhost:3000/merch/orde… |
| TC-41 | POST | /api/v2/merch/resolve/A_u9wsZu8yxlCFNIDvAjXr0flkPokD3C7XAaDnfUlHY/refund | none | 200 | 200 | ✅ PASS | {"success":true,"message":"Refund requested. Our Finance team will process it and email you a receipt."} |
| TC-42 | POST | /api/v2/merch/resolve/A_u9wsZu8yxlCFNIDvAjXr0flkPokD3C7XAaDnfUlHY/refund | none | 410 | 410 | ✅ PASS | {"success":false,"message":"This link has already been used."} |
| TC-43 | POST | /api/v2/merch/resolve/wSa3MJ8fWuPl_0HQY__7uZGx41iMNxtp3OFTFzm-ni4/swap | none | 409 | 409 | ✅ PASS | {"success":false,"message":"That size just sold out too. Please pick another available size or request a refund."} |

### Phase E — Refunds (full + price-difference)

| TC | Method | Path | Role | Exp | Act | Result | Response (truncated) |
|----|--------|------|------|-----|-----|--------|----------------------|
| TC-48 | POST | /api/v2/admin/merch/orders/42f613d1-6283-4d41-8932-6921355f8c68/refund | head | 200 | 200 | ✅ PASS | {"success":true,"message":"Refund recorded and the student notified."} |
| TC-49 | POST | /api/v2/admin/merch/orders/ce73de88-0a84-4290-9083-f15c14210724/refund | head | 400 | 400 | ✅ PASS | {"success":false,"message":"Validation error","errors":{"note":["A note explaining the refund is required when the method is 'Other'"]}} |
| TC-50 | POST | /api/v2/admin/merch/orders/06c60147-82ff-4ed4-a850-1fcd13d05ab3/refund | head | 200 | 200 | ✅ PASS | {"success":true,"message":"Refund recorded and the student notified."} |
| TC-50b | POST | /api/v2/admin/merch/orders/06c60147-82ff-4ed4-a850-1fcd13d05ab3/refund | head | 409 | 409 | ✅ PASS | {"success":false,"message":"This order is not awaiting a refund (nothing owed)."} |
| TC-50c | POST | /api/v2/admin/merch/orders/21fcb30a-d7f2-417f-8062-2672a72fad6a/refund | head | 400 | 400 | ✅ PASS | {"success":false,"message":"Refund amount cannot exceed the order total of ₱350.00."} |
| TC-50d | POST | /api/v2/admin/merch/orders/c327d5f3-d484-4ed1-abc5-81d2b5e0af06/refund | head | 409 | 409 | ✅ PASS | {"success":false,"message":"This order is not awaiting a refund (nothing owed)."} |

### Phase F — Operability (resend / detail / queue)

| TC | Method | Path | Role | Exp | Act | Result | Response (truncated) |
|----|--------|------|------|-----|-----|--------|----------------------|
| TC-44 | POST | /api/v2/admin/merch/orders/3c229b08-907e-474f-8399-49de05b594b5/resend-email | finance | 200 | 200 | ✅ PASS | {"success":true,"message":"Status email resent to the student."} |
| TC-45 | GET | /api/v2/admin/merch/orders/0daf6236-58ec-48d9-b8ae-8d6e8a5f7101 | finance | 200 | 200 | ✅ PASS | {"success":true,"data":{"order":{"id":"0daf6236-58ec-48d9-b8ae-8d6e8a5f7101","orderRef":"MSC-MERCH-2026-0010","studentName":"E2E Buyer","studentId":null,"email":"rejam@example.com"… |
| TC-46 | GET | /api/v2/admin/merch/orders | finance | 200 | 200 | ✅ PASS | {"success":true,"data":{"orders":[{"id":"ae4f9947-4229-4dee-9e0b-1a77d946632a","orderRef":"MSC-MERCH-2026-0014","studentName":"E2E Buyer","studentId":null,"email":"os2@example.com"… |
| TC-46b | GET | /api/v2/admin/merch/orders | finance | 200 | 200 | ✅ PASS | {"success":true,"data":{"orders":[{"id":"2b2a22ab-b12f-41e6-8019-b8d65b547dce","orderRef":"MSC-MERCH-2026-0020","studentName":"E2E Buyer","studentId":null,"email":"swapcheaper@exam… |
| TC-47 | GET | /api/v2/admin/merch/orders | finance | 200 | 200 | ✅ PASS | {"success":true,"data":{"orders":[{"id":"de691d8b-b610-469c-ba70-23702775d67b","orderRef":"MSC-MERCH-2026-0030","studentName":"E2E Buyer","studentId":null,"email":"overdue@example.… |

### Phase G — Security, RBAC & image proxies

| TC | Method | Path | Role | Exp | Act | Result | Response (truncated) |
|----|--------|------|------|-----|-----|--------|----------------------|
| TC-51 | GET | /api/v2/admin/merch/screenshots/proof-fdb28a71-9806-460e-8029-721869717f10-cbee1c19-333c-4e03-8761-aa73bd893274.png | finance | 200 | 200 | ✅ PASS | (image/png, 70 bytes) |
| TC-52 | GET | /api/v2/admin/merch/screenshots/proof-fdb28a71-9806-460e-8029-721869717f10-cbee1c19-333c-4e03-8761-aa73bd893274.png | none | 401 | 401 | ✅ PASS | {"success":false,"message":"Unauthorized - authentication required"} |
| TC-53 | GET | /api/v2/merch/photos/proof-fdb28a71-9806-460e-8029-721869717f10-cbee1c19-333c-4e03-8761-aa73bd893274.png | none | 400 | 400 | ✅ PASS | {"success":false,"message":"This file is not a catalog photo."} |
| TC-54 | GET | /api/v2/admin/merch/screenshots/item-91dfe903-ac92-4c1e-aeae-a9fbecd18e25.png | finance | 400 | 400 | ✅ PASS | {"success":false,"message":"This file is not a payment screenshot."} |
| TC-54b | GET | /api/v2/merch/photos/..%2f..%2fetc%2fpasswd | none | 400 | 400 | ✅ PASS | {"success":false,"message":"Invalid photo filename"} |
| TC-55 | POST | /api/v2/admin/merch/items | none | 401 | 401 | ✅ PASS | {"success":false,"message":"Unauthorized - authentication required"} |
| TC-55-member | POST | /api/v2/admin/merch/items | member | 403 | 403 | ✅ PASS | {"success":false,"message":"Forbidden - ADMIN_FINANCE or ADMIN_FINANCE_HEAD access required"} |
| TC-55b-archive | POST | /api/v2/admin/merch/items/568cdf08-09bd-474f-9deb-52b8eca00cfe/archive | finance | 403 | 403 | ✅ PASS | {"success":false,"message":"Forbidden - ADMIN_FINANCE_HEAD access required"} |
| TC-55b-cancel | POST | /api/v2/admin/merch/orders/c327d5f3-d484-4ed1-abc5-81d2b5e0af06/cancel | finance | 403 | 403 | ✅ PASS | {"success":false,"message":"Forbidden - ADMIN_FINANCE_HEAD access required"} |
| TC-55b-refund | POST | /api/v2/admin/merch/orders/c327d5f3-d484-4ed1-abc5-81d2b5e0af06/refund | finance | 403 | 403 | ✅ PASS | {"success":false,"message":"Forbidden - ADMIN_FINANCE_HEAD access required"} |
| TC-55c | POST | /api/v2/admin/merch/items/9ebac6f1-7a4e-44d7-a65c-0fa2ce5fd42b/archive | head | 200 | 200 | ✅ PASS | {"success":true,"message":"Item archived"} |
| TC-55d-track | GET | /api/v2/merch/orders/MSC-MERCH-2026-0001 | none | 404 | 404 | ✅ PASS | {"success":false,"message":"Order not found"} |
| TC-55d-proof | POST | /api/v2/merch/orders/MSC-MERCH-2026-0001/payment-proof | none | 404 | 404 | ✅ PASS | {"success":false,"message":"Order not found"} |
| TC-55e | POST | /api/v2/merch/orders/MSC-MERCH-2026-0037/payment-proof | none | 409 | 409 | ✅ PASS | {"success":false,"message":"The GCash reference number you submitted has already been used on another order. If you believe this is an error, please contact the Finance team direct… |

### Phase H — Edge & regression

| TC | Method | Path | Role | Exp | Act | Result | Response (truncated) |
|----|--------|------|------|-----|-----|--------|----------------------|
| TC-56 | POST | /api/v2/admin/merch/items | finance | 400 | 400 | ✅ PASS | {"success":false,"message":"You can upload at most 6 photos"} |
| TC-57 | POST | /api/v2/merch/orders/MSC-MERCH-2026-0038/payment-proof | none | 400 | 400 | ✅ PASS | {"success":false,"message":"Payment screenshot: Invalid file type (application/pdf). Only JPEG, PNG, or WEBP images are allowed."} |
| TC-58 | POST | /api/v2/merch/orders/MSC-MERCH-2026-0038/payment-proof | none | 400 | 400 | ✅ PASS | {"success":false,"message":"Validation error","errors":{"referenceNumber":["The GCash reference number must be exactly 13 digits"]}} |
| TC-59 | POST | /api/v2/admin/merch/items | finance | 400 | 400 | ✅ PASS | {"success":false,"message":"Validation error","errors":{"variants":["Variant labels must be unique within an item"]}} |
| TC-60 | POST | /api/v2/merch/orders | none | 409 | 409 | ✅ PASS | {"success":false,"message":"Sorry, the selected size is no longer available. Please choose a different size or check back later."} |
| TC-62 | POST | /api/v2/merch/orders | none | 503 | 503 | ✅ PASS | {"success":false,"message":"Online pre-orders are temporarily unavailable. Please try again later."} |
| TC-64 | POST | /api/v2/admin/merch/orders/c327d5f3-d484-4ed1-abc5-81d2b5e0af06/confirm | finance | 409 | 409 | ✅ PASS | {"success":false,"message":"Only orders pending verification can be confirmed."} |
| TC-65 | GET | /api/v2/merch/resolve/LcsDDrDeUS_7xNRUIFfOU9fzFk7biV_0AjEl4zgKWv0 | none | 409 | 409 | ✅ PASS | {"success":false,"message":"This order has already been resolved."} |

### Phase I — Admin item management

| TC | Method | Path | Role | Exp | Act | Result | Response (truncated) |
|----|--------|------|------|-----|-----|--------|----------------------|
| TC-70 | GET | /api/v2/admin/merch/items | finance | 200 | 200 | ✅ PASS | {"success":true,"data":{"items":[{"id":"4cc321a3-4090-4df2-9420-f8c65d5dec83","name":"Limited Pin","description":"Limited Pin — e2e fixture","price":350,"status":"ACTIVE","photos":… |
| TC-71 | GET | /api/v2/admin/merch/items | finance | 200 | 200 | ✅ PASS | {"success":true,"data":{"items":[{"id":"4cc321a3-4090-4df2-9420-f8c65d5dec83","name":"Limited Pin","description":"Limited Pin — e2e fixture","price":350,"status":"ACTIVE","photos":… |
| TC-72 | GET | /api/v2/admin/merch/items | finance | 200 | 200 | ✅ PASS | {"success":true,"data":{"items":[{"id":"9ebac6f1-7a4e-44d7-a65c-0fa2ce5fd42b","name":"To Be Archived","description":"To Be Archived — e2e fixture","price":200,"status":"ARCHIVED","… |
| TC-73 | GET | /api/v2/admin/merch/items | none | 401 | 401 | ✅ PASS | {"success":false,"message":"Unauthorized - authentication required"} |
| TC-74 | GET | /api/v2/admin/merch/items | member | 403 | 403 | ✅ PASS | {"success":false,"message":"Forbidden - ADMIN_FINANCE or ADMIN_FINANCE_HEAD access required"} |
| TC-75 | PATCH | /api/v2/admin/merch/items/2f6ac5fb-9bd5-4431-8227-9730f9c8f38f | finance | 200 | 200 | ✅ PASS | {"success":true,"data":{"item":{"id":"2f6ac5fb-9bd5-4431-8227-9730f9c8f38f","name":"Edited Tee","description":"Editable Cap — e2e fixture","price":375,"status":"ACTIVE","photos":["… |
| TC-76 | PATCH | /api/v2/admin/merch/items/2f6ac5fb-9bd5-4431-8227-9730f9c8f38f | finance | 200 | 200 | ✅ PASS | {"success":true,"data":{"item":{"id":"2f6ac5fb-9bd5-4431-8227-9730f9c8f38f","name":"Edited Tee","description":"Editable Cap — e2e fixture","price":375,"status":"ACTIVE","photos":["… |
| TC-77 | PATCH | /api/v2/admin/merch/items/2f6ac5fb-9bd5-4431-8227-9730f9c8f38f | finance | 200 | 200 | ✅ PASS | {"success":true,"data":{"item":{"id":"2f6ac5fb-9bd5-4431-8227-9730f9c8f38f","name":"Edited Tee","description":"Editable Cap — e2e fixture","price":375,"status":"ACTIVE","photos":["… |
| TC-78 | PATCH | /api/v2/admin/merch/items/2f6ac5fb-9bd5-4431-8227-9730f9c8f38f | finance | 400 | 400 | ✅ PASS | {"success":false,"message":"Validation error","errors":{"price":["Price must be greater than zero"]}} |
| TC-79 | PATCH | /api/v2/admin/merch/items/00000000-0000-4000-8000-000000000000 | finance | 404 | 404 | ✅ PASS | {"success":false,"message":"Item not found"} |
| TC-80 | PATCH | /api/v2/admin/merch/items/2f6ac5fb-9bd5-4431-8227-9730f9c8f38f | none | 401 | 401 | ✅ PASS | {"success":false,"message":"Unauthorized - authentication required"} |
| TC-81 | PATCH | /api/v2/admin/merch/items/2f6ac5fb-9bd5-4431-8227-9730f9c8f38f | member | 403 | 403 | ✅ PASS | {"success":false,"message":"Forbidden - ADMIN_FINANCE or ADMIN_FINANCE_HEAD access required"} |
| TC-82 | POST | /api/v2/admin/merch/items/5306f188-0899-4f4c-af7d-4b779ec30c88/archive | head | 409 | 409 | ✅ PASS | {"success":false,"message":"Item is already archived."} |
| TC-83 | POST | /api/v2/admin/merch/items/00000000-0000-4000-8000-000000000000/archive | head | 404 | 404 | ✅ PASS | {"success":false,"message":"Item not found"} |

### Phase J — Cancel order lifecycle

| TC | Method | Path | Role | Exp | Act | Result | Response (truncated) |
|----|--------|------|------|-----|-----|--------|----------------------|
| TC-84 | POST | /api/v2/admin/merch/orders/749a72a7-2f14-4e06-b95d-80c3de16dcaf/cancel | head | 200 | 200 | ✅ PASS | {"success":true,"message":"Order cancelled and the student notified."} |
| TC-85 | POST | /api/v2/admin/merch/orders/e4570ed0-83cd-479d-91c4-38783b08a4d5/cancel | head | 200 | 200 | ✅ PASS | {"success":true,"message":"Order cancelled and the student notified."} |
| TC-86 | POST | /api/v2/admin/merch/orders/98430c04-1278-4ffb-94db-5de2e8aca3c3/cancel | head | 400 | 400 | ✅ PASS | {"success":false,"message":"Validation error","errors":{"financeNote":["A cancellation note is required"]}} |
| TC-87 | POST | /api/v2/admin/merch/orders/749a72a7-2f14-4e06-b95d-80c3de16dcaf/cancel | head | 409 | 409 | ✅ PASS | {"success":false,"message":"This order can no longer be cancelled."} |
| TC-88 | POST | /api/v2/admin/merch/orders/34d166f6-f0fc-4b94-b4da-13aa6a2ea30c/cancel | head | 409 | 409 | ✅ PASS | {"success":false,"message":"This order can no longer be cancelled."} |
| TC-89 | POST | /api/v2/admin/merch/orders/bc4c8c18-9e4d-4767-8044-6ac60bc214ba/cancel | head | 409 | 409 | ✅ PASS | {"success":false,"message":"This order can no longer be cancelled."} |
| TC-90 | POST | /api/v2/admin/merch/orders/00000000-0000-4000-8000-000000000000/cancel | head | 404 | 404 | ✅ PASS | {"success":false,"message":"Order not found"} |

### Phase K — 404 (unknown id) matrix

| TC | Method | Path | Role | Exp | Act | Result | Response (truncated) |
|----|--------|------|------|-----|-----|--------|----------------------|
| TC-91 | GET | /api/v2/admin/merch/orders/00000000-0000-4000-8000-000000000000 | finance | 404 | 404 | ✅ PASS | {"success":false,"message":"Order not found"} |
| TC-92 | POST | /api/v2/admin/merch/orders/00000000-0000-4000-8000-000000000000/confirm | finance | 404 | 404 | ✅ PASS | {"success":false,"message":"Order not found"} |
| TC-93 | POST | /api/v2/admin/merch/orders/00000000-0000-4000-8000-000000000000/reject | finance | 404 | 404 | ✅ PASS | {"success":false,"message":"Order not found"} |
| TC-94 | POST | /api/v2/admin/merch/orders/00000000-0000-4000-8000-000000000000/claim | finance | 404 | 404 | ✅ PASS | {"success":false,"message":"Order not found"} |
| TC-95 | POST | /api/v2/admin/merch/orders/00000000-0000-4000-8000-000000000000/refund | head | 404 | 404 | ✅ PASS | {"success":false,"message":"Order not found"} |
| TC-96 | POST | /api/v2/admin/merch/orders/00000000-0000-4000-8000-000000000000/resend-email | finance | 404 | 404 | ✅ PASS | {"success":false,"message":"Order not found"} |
| TC-97 | POST | /api/v2/admin/merch/orders/00000000-0000-4000-8000-000000000000/resolution-link | finance | 404 | 404 | ✅ PASS | {"success":false,"message":"Order not found"} |

### Phase L — 401/403 auth matrix

| TC | Method | Path | Role | Exp | Act | Result | Response (truncated) |
|----|--------|------|------|-----|-----|--------|----------------------|
| TC-100 | GET | /api/v2/admin/merch/orders | none | 401 | 401 | ✅ PASS | {"success":false,"message":"Unauthorized - authentication required"} |
| TC-101 | GET | /api/v2/admin/merch/orders | member | 403 | 403 | ✅ PASS | {"success":false,"message":"Forbidden - ADMIN_FINANCE or ADMIN_FINANCE_HEAD access required"} |
| TC-102 | GET | /api/v2/admin/merch/orders/c327d5f3-d484-4ed1-abc5-81d2b5e0af06 | none | 401 | 401 | ✅ PASS | {"success":false,"message":"Unauthorized - authentication required"} |
| TC-103 | GET | /api/v2/admin/merch/orders/c327d5f3-d484-4ed1-abc5-81d2b5e0af06 | member | 403 | 403 | ✅ PASS | {"success":false,"message":"Forbidden - ADMIN_FINANCE or ADMIN_FINANCE_HEAD access required"} |
| TC-104 | POST | /api/v2/admin/merch/orders/c327d5f3-d484-4ed1-abc5-81d2b5e0af06/confirm | none | 401 | 401 | ✅ PASS | {"success":false,"message":"Unauthorized - authentication required"} |
| TC-105 | POST | /api/v2/admin/merch/orders/c327d5f3-d484-4ed1-abc5-81d2b5e0af06/confirm | member | 403 | 403 | ✅ PASS | {"success":false,"message":"Forbidden - ADMIN_FINANCE or ADMIN_FINANCE_HEAD access required"} |
| TC-106 | POST | /api/v2/admin/merch/orders/c327d5f3-d484-4ed1-abc5-81d2b5e0af06/reject | none | 401 | 401 | ✅ PASS | {"success":false,"message":"Unauthorized - authentication required"} |
| TC-107 | POST | /api/v2/admin/merch/orders/c327d5f3-d484-4ed1-abc5-81d2b5e0af06/reject | member | 403 | 403 | ✅ PASS | {"success":false,"message":"Forbidden - ADMIN_FINANCE or ADMIN_FINANCE_HEAD access required"} |
| TC-108 | POST | /api/v2/admin/merch/orders/c327d5f3-d484-4ed1-abc5-81d2b5e0af06/claim | none | 401 | 401 | ✅ PASS | {"success":false,"message":"Unauthorized - authentication required"} |
| TC-109 | POST | /api/v2/admin/merch/orders/c327d5f3-d484-4ed1-abc5-81d2b5e0af06/claim | member | 403 | 403 | ✅ PASS | {"success":false,"message":"Forbidden - ADMIN_FINANCE or ADMIN_FINANCE_HEAD access required"} |
| TC-110 | POST | /api/v2/admin/merch/orders/c327d5f3-d484-4ed1-abc5-81d2b5e0af06/resend-email | none | 401 | 401 | ✅ PASS | {"success":false,"message":"Unauthorized - authentication required"} |
| TC-111 | POST | /api/v2/admin/merch/orders/c327d5f3-d484-4ed1-abc5-81d2b5e0af06/resend-email | member | 403 | 403 | ✅ PASS | {"success":false,"message":"Forbidden - ADMIN_FINANCE or ADMIN_FINANCE_HEAD access required"} |
| TC-112 | POST | /api/v2/admin/merch/orders/c327d5f3-d484-4ed1-abc5-81d2b5e0af06/resolution-link | none | 401 | 401 | ✅ PASS | {"success":false,"message":"Unauthorized - authentication required"} |
| TC-113 | POST | /api/v2/admin/merch/orders/c327d5f3-d484-4ed1-abc5-81d2b5e0af06/resolution-link | member | 403 | 403 | ✅ PASS | {"success":false,"message":"Forbidden - ADMIN_FINANCE or ADMIN_FINANCE_HEAD access required"} |
| TC-114 | GET | /api/v2/admin/merch/screenshots/proof-fdb28a71-9806-460e-8029-721869717f10-cbee1c19-333c-4e03-8761-aa73bd893274.png | member | 403 | 403 | ✅ PASS | {"success":false,"message":"Forbidden - ADMIN_FINANCE or ADMIN_FINANCE_HEAD access required"} |
| TC-115 | POST | /api/v2/admin/merch/items/568cdf08-09bd-474f-9deb-52b8eca00cfe/archive | none | 401 | 401 | ✅ PASS | {"success":false,"message":"Unauthorized - authentication required"} |
| TC-116 | POST | /api/v2/admin/merch/orders/c327d5f3-d484-4ed1-abc5-81d2b5e0af06/cancel | none | 401 | 401 | ✅ PASS | {"success":false,"message":"Unauthorized - authentication required"} |
| TC-117 | POST | /api/v2/admin/merch/orders/c327d5f3-d484-4ed1-abc5-81d2b5e0af06/refund | none | 401 | 401 | ✅ PASS | {"success":false,"message":"Unauthorized - authentication required"} |
| TC-118 | GET | /api/v2/admin/merch/orders | head | 200 | 200 | ✅ PASS | {"success":true,"data":{"orders":[{"id":"e7a7af26-2351-4a9c-86d3-cf54e34e1f7b","orderRef":"MSC-MERCH-2026-0001","studentName":"E2E Buyer","studentId":null,"email":"track@example.co… |

### Phase M — Pagination & filters

| TC | Method | Path | Role | Exp | Act | Result | Response (truncated) |
|----|--------|------|------|-----|-----|--------|----------------------|
| TC-120 | GET | /api/v2/admin/merch/orders | finance | 200 | 200 | ✅ PASS | {"success":true,"data":{"orders":[{"id":"e7a7af26-2351-4a9c-86d3-cf54e34e1f7b","orderRef":"MSC-MERCH-2026-0001","studentName":"E2E Buyer","studentId":null,"email":"track@example.co… |
| TC-121 | GET | /api/v2/admin/merch/orders | finance | 200 | 200 | ✅ PASS | {"success":true,"data":{"orders":[{"id":"e7a7af26-2351-4a9c-86d3-cf54e34e1f7b","orderRef":"MSC-MERCH-2026-0001","studentName":"E2E Buyer","studentId":null,"email":"track@example.co… |
| TC-122 | GET | /api/v2/admin/merch/orders | finance | 200 | 200 | ✅ PASS | {"success":true,"data":{"orders":[{"id":"fdb28a71-9806-460e-8029-721869717f10","orderRef":"MSC-MERCH-2026-0003","studentName":"E2E Buyer","studentId":null,"email":"confirm@example.… |
| TC-123 | GET | /api/v2/admin/merch/orders | finance | 200 | 200 | ✅ PASS | {"success":true,"data":{"orders":[{"id":"c8471dd4-d891-41e1-be77-6de95e706298","orderRef":"MSC-MERCH-2026-0002","studentName":"E2E Buyer","studentId":null,"email":"pp@example.com",… |
| TC-124 | GET | /api/v2/admin/merch/orders | finance | 200 | 200 | ✅ PASS | {"success":true,"data":{"orders":[{"id":"e7a7af26-2351-4a9c-86d3-cf54e34e1f7b","orderRef":"MSC-MERCH-2026-0001","studentName":"E2E Buyer","studentId":null,"email":"track@example.co… |

### Phase O — Validation matrix

| TC | Method | Path | Role | Exp | Act | Result | Response (truncated) |
|----|--------|------|------|-----|-----|--------|----------------------|
| TC-130 | POST | /api/v2/merch/orders | none | 400 | 400 | ✅ PASS | {"success":false,"message":"Validation error","errors":{"variantId":["A variant selection is required"]}} |
| TC-131 | POST | /api/v2/merch/orders | none | 400 | 400 | ✅ PASS | {"success":false,"message":"Validation error","errors":{"quantity":["Quantity must be at least 1"]}} |
| TC-132 | POST | /api/v2/merch/orders | none | 400 | 400 | ✅ PASS | {"success":false,"message":"Validation error","errors":{"quantity":["Quantity cannot exceed 20 per order"]}} |
| TC-133 | POST | /api/v2/merch/orders | none | 400 | 400 | ✅ PASS | {"success":false,"message":"Validation error","errors":{"email":["Enter a valid email address"]}} |
| TC-134 | POST | /api/v2/merch/orders | none | 400 | 400 | ✅ PASS | {"success":false,"message":"Validation error","errors":{"studentName":["Full name is required"]}} |
| TC-135 | POST | /api/v2/merch/orders | none | 409 | 409 | ✅ PASS | {"success":false,"message":"Sorry, the selected size is no longer available. Please choose a different size or check back later."} |
| TC-136 | POST | /api/v2/merch/orders | none | 404 | 404 | ✅ PASS | {"success":false,"message":"The selected item or variant is unavailable."} |
| TC-137 | POST | /api/v2/merch/resolve/W_jNL5p2nQhB0F_JoOtrH0CSR8NOKiu11lJ00y3eXsU/swap | none | 400 | 400 | ✅ PASS | {"success":false,"message":"Validation error","errors":{"variantId":["Select a size to switch to"]}} |
| TC-138 | POST | /api/v2/merch/resolve/W_jNL5p2nQhB0F_JoOtrH0CSR8NOKiu11lJ00y3eXsU/swap | none | 400 | 400 | ✅ PASS | {"success":false,"message":"Please choose a different, available size."} |
| TC-139 | GET | /api/v2/merch/orders/MSC-MERCH-2026-0001 | none | 400 | 400 | ✅ PASS | {"success":false,"message":"Validation error","errors":{"email":["Email is required to view this order"]}} |
| TC-140 | POST | /api/v2/merch/orders/MSC-MERCH-2026-0001/payment-proof | none | 400 | 400 | ✅ PASS | {"success":false,"message":"A payment screenshot is required."} |

### Phase P — Resolution-link / resolve edges

| TC | Method | Path | Role | Exp | Act | Result | Response (truncated) |
|----|--------|------|------|-----|-----|--------|----------------------|
| TC-141 | POST | /api/v2/admin/merch/orders/c327d5f3-d484-4ed1-abc5-81d2b5e0af06/resolution-link | finance | 409 | 409 | ✅ PASS | {"success":false,"message":"This order is not awaiting resolution."} |
| TC-142 | GET | /api/v2/merch/resolve/deadbeefdeadbeefdeadbeefdeadbeef | none | 404 | 404 | ✅ PASS | {"success":false,"message":"This resolution link is invalid."} |
| TC-143 | GET | /api/v2/merch/resolve/XYCue-HdS75S5fkihon-5VckvwEDKORTY42uGn2269E | none | 410 | 410 | ✅ PASS | {"success":false,"message":"This link has expired. Please contact the Finance team for a new one."} |
| TC-144 | POST | /api/v2/merch/resolve/deadbeefdeadbeefdeadbeefdeadbeef/swap | none | 404 | 404 | ✅ PASS | {"success":false,"message":"This resolution link is invalid."} |
| TC-145 | POST | /api/v2/merch/resolve/deadbeefdeadbeefdeadbeefdeadbeef/refund | none | 404 | 404 | ✅ PASS | {"success":false,"message":"This resolution link is invalid."} |

### Phase N — Shop-toggle per public endpoint

| TC | Method | Path | Role | Exp | Act | Result | Response (truncated) |
|----|--------|------|------|-----|-----|--------|----------------------|
| TC-61 | GET | /api/v2/merch | none | 503 | 503 | ✅ PASS | {"success":false,"message":"The merch shop is currently closed."} |
| TC-125 | GET | /api/v2/merch/568cdf08-09bd-474f-9deb-52b8eca00cfe | none | 503 | 503 | ✅ PASS | {"success":false,"message":"The merch shop is currently closed."} |
| TC-126 | GET | /api/v2/merch/photos/item-91dfe903-ac92-4c1e-aeae-a9fbecd18e25.png | none | 200 | 200 | ✅ PASS | (image/png, 70 bytes) |
| TC-127 | GET | /api/v2/merch/orders/MSC-MERCH-2026-0001 | none | 200 | 200 | ✅ PASS | {"success":true,"data":{"order":{"orderRef":"MSC-MERCH-2026-0001","studentName":"E2E Buyer","studentId":null,"email":"track@example.com","itemName":"MSC Shirt","variantLabel":"S","… |
| TC-128 | GET | /api/v2/merch/resolve/FMwoffu9IUY4mWwZZvp0C18mBrbO2H5Yil8QiD_oJho | none | 200 | 200 | ✅ PASS | {"success":true,"data":{"order":{"orderRef":"MSC-MERCH-2026-0040","itemName":"MSC Shirt","soldOutVariantLabel":"M","quantity":1,"amountPaid":350,"status":"AWAITING_RESOLUTION"},"op… |
| TC-63 | POST | /api/v2/merch/orders | none | 429 | 429 | ✅ PASS | {"success":false,"message":"Too many pre-order attempts. Please try again later."} |
| TC-63 | POST | /api/v2/merch/orders | none | 429 | 429 | ✅ PASS | {"success":false,"message":"Too many pre-order attempts. Please try again later."} |
| TC-63 | POST | /api/v2/merch/orders | none | 429 | 429 | ✅ PASS | {"success":false,"message":"Too many pre-order attempts. Please try again later."} |
| TC-63 | POST | /api/v2/merch/orders | none | 429 | 429 | ✅ PASS | {"success":false,"message":"Too many pre-order attempts. Please try again later."} |
| TC-63 | POST | /api/v2/merch/orders | none | 429 | 429 | ✅ PASS | {"success":false,"message":"Too many pre-order attempts. Please try again later."} |
| TC-63 | POST | /api/v2/merch/orders | none | 429 | 429 | ✅ PASS | {"success":false,"message":"Too many pre-order attempts. Please try again later."} |
| TC-63 | POST | /api/v2/merch/orders | none | 429 | 429 | ✅ PASS | {"success":false,"message":"Too many pre-order attempts. Please try again later."} |
| TC-63 | POST | /api/v2/merch/orders | none | 429 | 429 | ✅ PASS | {"success":false,"message":"Too many pre-order attempts. Please try again later."} |
| TC-63 | POST | /api/v2/merch/orders | none | 429 | 429 | ✅ PASS | {"success":false,"message":"Too many pre-order attempts. Please try again later."} |
| TC-63 | POST | /api/v2/merch/orders | none | 429 | 429 | ✅ PASS | {"success":false,"message":"Too many pre-order attempts. Please try again later."} |
| TC-63 | POST | /api/v2/merch/orders | none | 429 | 429 | ✅ PASS | {"success":false,"message":"Too many pre-order attempts. Please try again later."} |
| TC-63 | POST | /api/v2/merch/orders | none | 429 | 429 | ✅ PASS | {"success":false,"message":"Too many pre-order attempts. Please try again later."} |
| TC-63 | POST | /api/v2/merch/orders | none | 429 | 429 | ✅ PASS | {"success":false,"message":"Too many pre-order attempts. Please try again later."} |

## Environment / runner limitations (classified, not API failures)

- **Postman cloud runner** cannot reach `localhost` and does not support multipart file
  uploads, so a cloud Monitor run fails every request. This is why **Newman-local** is the
  execution path. The single cloud attempt is recorded above.
- **Email delivery** is not asserted over HTTP (SMTP sends to `@example.com` fail-soft and the
  senders return `false`); email **content** is asserted by the Vitest render suite instead.
- **Rate limit (TC-63)** runs against a dedicated `:5051` server with real limits; the main
  `:5000` server relaxes the limiter (`E2E_RELAX_RATELIMIT`) so seeding ~40 orders doesn't 429.
- **Overdue top-up (TC-47)** uses a row aged 8 days via SQL in the harness (time-travel).

## Readiness verdict

**The Pre-Order module (Module 04) is READY for QA / further testing.** All 23 endpoints pass across happy-path, RBAC (401/403), validation, edge, oversell-resolution, refund, and shop-toggle scenarios; email copy is verified separately. No open defects.
