# 

Created: July 9, 2026 11:18 PM
Collaborating Departments: Artificial Intelligence & Innovation, Cybersecurity & Information Assurance, Systems Integration & Cloud Infrastructure
Initiative: Central Portal
Lead Department: Software & Application Development
Version: Version 2 (August 2026)

QCU MSC Central Portal 

## Product Overview

**Project Name**

QCU MSC Central Portal (V2 Events & Logistics Release)

**Objective**

To upgrade the primary digital hub into a full organizational management platform, expanding beyond acquisition to handle automated event ticketing, live QR logistics, offline merchandise pre-orders, executive data dashboards, and a public project showcase.

## User Roles and Permissions

| **Role** | **Description** | **Key Permissions** |
| --- | --- | --- |
| **Superadmin (System Lead)** | Head Developer or Org President. | Inherits all Admin access. Can change roles for other users, view security logs, and globally toggle system features (e.g., locking registrations or opening the merch shop). |
| **Admin (Core Team)** | Executive board. | Views the executive analytics dashboard to monitor organizational health. Approves or rejects project links submitted to the showcase. |
| **Admin (Finance)** | Officers handling the organization's funds and inventory. | Manages the merch catalog, tracks student reservations, and mutations order statuses to "Paid & Claimed" during physical handoffs. |
| **Admin (Logistics)** | Officers responsible for physical event staging and execution. | Creates new event entries, manages attendee rosters, and utilizes the mobile-friendly QR scanner to validate tickets at venue doors. |
| **Startup Developer** | Technical talent within the community. | Submits live deployed web applications, GitHub repositories, and data visualization models to the Project Incubation Showcase. |
| **Member** | Active QCU MSC student. | Bypasses the Zonal OCR requirement for event sign-ups and receives priority early-access ticketing. |
| **QCU Student (Non-Member)** | General student body. | Can register for public events and apply for the DataCamp Scholarship via Zonal OCR ID scan. Can reserve items in the merch catalog. |
| **Public Guest** | Unregistered visitor or corporate lead. | Can view the public Project Incubation Showcase to verify student technical competencies. |

## Global Non-Functional Requirements

**V1 Architecture Inheritance:** All security, authentication, and performance standards established in V1 (JWT route protection, password hashing, TLS 1.2+ encryption, Rate Limiting, and XSS/Injection sanitation) must be universally applied to all V2 modules.

**Role Inheritance:** The backend must automatically authorize the `Superadmin` to perform any action restricted to `Admin (Logistics)`, `Admin (Finance)`, or `Admin (Core Team)` to centralize system control.

**High-Traffic Optimization:** The database and server architecture must be optimized to handle large concurrency spikes specifically for event registrations and merch reservations to prevent race conditions or crashes.

**Responsiveness (Mobile-First Logistics):** The UI must remain fully mobile-responsive (minimum viewport 320px), with strict optimization for the QR scanner route to ensure seamless operation on standard smartphone cameras in low-light venue environments.

## Module Specifications

### **Module Name: Super Admin Settings Hub**

**Description:** A protected configuration dashboard allowing top-level users to manage organizational roles and toggle system states dynamically without manual database intervention.

**User Story 1:** As a Superadmin, I want to toggle a switch to open or close the merch shop instantly across the entire frontend.

**Acceptance Criteria:**

- **Role Management:** A protected data table allowing the Superadmin to mutate the role of any registered user (e.g., upgrading a Member to Admin).
- **System Toggles:** Global boolean switches governing subsystem availability (e.g., "Event Registrations Open", "Merch Shop Open", "Maintenance Mode").
- **Audit Viewer:** A read-only interface displaying the tamper-evident audit logs of all administrative actions.
**Edge Cases & Errors:**
- **Self-Demotion Lock:** The backend must strictly prevent a Superadmin from downgrading their own role to avoid permanent system lockouts.

### **Module Name: Event Registration & QR Tickets**

**Description:** The automated ticketing engine for workshops and seminars, featuring tiered access and dynamic QR payload generation.

**User Story 1:** As a student, I want to seamlessly register for a seminar using my QCU ID so I can receive a digital QR ticket in my email.

**Acceptance Criteria:**

- **Tiered Registration Phases:** Supports `priorityStartDate` for Members and `generalStartDate` for Non-Members.
- **Frictionless Data Capture:** Non-members utilize the V1 Zonal OCR system to verify their ID and register without account creation. Members bypass OCR entirely.
- **Ticket Dispatch:** Upon successful registration, the backend generates a unique UUID-based QR payload and dispatches it via the automated email engine.
**Edge Cases & Errors:**
- **Duplicate Registration Prevention:** Cross-references the student number against the event roster. Blocks the submission if a duplicate is detected.

### **Module Name: Event Logistics & Check-In**

**Description:** The physical execution workspace for the Logistics Office to stage events and validate digital tickets on-site.

**User Story 1:** As a Logistics Officer, I want to scan a student's QR ticket using my smartphone camera to instantly mark them as attended.

**Acceptance Criteria:**

- **Event Creation Form:** Admin input for Event Title, Date, Access Type (Public/Members-Only), and Max Capacity.
- **QR Scanner Route:** A dedicated mobile-optimized route (`/admin/events/scan`) that utilizes the device camera, reads the QR payload, validates it against the database, and flips a boolean `hasAttended` flag.
- **Manual Override:** A search bar to manually check in attendees in the event of device failure or lost tickets.
**Edge Cases & Errors:**
- **Validation Rejection:** If the scanner reads a QR code that is foreign, duplicated, or already scanned, the UI must render a prominent red error: "Invalid Ticket or Already Scanned."

### **Module Name: Org Merch Pre-Orders (Offline Payments)**

**Description:** A catalog system managed by the Finance Office for students to browse inventory and reserve items, with all financial transactions strictly handled physically.

**User Story 1:** As a student, I want to reserve an org shirt in my size to guarantee stock before I physically visit the org room to pay.

**User Story 2:** As a Finance Admin, I want to track reservations so I can mark them complete upon physical payment.

**Acceptance Criteria:**

- **Merch Catalog:** A public routing displaying available inventory, pricing, and size options.
- **Reservation Capture:** A form collecting student credentials and size selection, featuring an explicit UI warning that payment is strictly offline.
- **Finance Order Tracker:** A protected data table for the Finance Office displaying all pending reservations, with a mutator button to transition orders to a "Paid & Claimed" status.
**Edge Cases & Errors:**
- **Stock Limits:** The UI must dynamically disable the "Reserve" button and render an "Out of Stock" badge when a specific size's inventory threshold is met.

### **Module Name: Project Incubation Showcase**

**Description:** A dynamic, filterable public gallery serving as a digital portfolio for the community's technical talent.

**User Story 1:** As a Startup Developer, I want to publish my web app link so industry professionals can evaluate my technical competencies.

**Acceptance Criteria:**

- **Public Grid:** Renders project cards displaying live deployments, repositories, and UI tags for the tech stack used.
- **Submission Workflow:** An internal form for developers to submit URLs. Submissions remain quarantined (hidden) until manually approved by a Core Team Admin.
**Edge Cases & Errors:**
- **Broken Link Detection:** The backend must validate the HTTP status of submitted URLs and instantly reject broken or improperly formatted links.

### **Module Name: Executive Data Analytics Dashboard**

**Description:** An internal visualization command center for the Core Team to monitor organizational metrics.

**User Story 1:** As an executive, I want to view automated charts of event attendance to assess the success of our initiatives.

**Acceptance Criteria:**

- **Data Aggregation:** Queries the HR, Events, and Finance pipelines to calculate automated health metrics.
- **Interactive Charts:** Renders visualizations for member growth trajectories, event attendance ratios, and merchandise conversion rates.
- **PDF Export:** A client-side utility to capture the dashboard state and export it as a formatted PDF for executive meetings.

### Module Name: DataCamp Scholarship Gateway

**Description:** A dedicated public application pipeline managing the intake, evaluation, and distribution of partnered DataCamp scholarship seats, utilizing OCR for student verification.

**User Story 1:** As a QCU student (non-member), I want to apply for the DataCamp scholarship by scanning my ID so the system can verify my enrollment without creating an account.

**User Story 2:** As a Core Team Admin, I want to evaluate incoming applications and distribute seats via an automated email trigger.

**Acceptance Criteria:**

- **Frictionless Data Capture (OCR):** Non-members utilize the V1 Zonal OCR system to verify their QCU ID and submit applications. Existing Members bypass OCR entirely.
- **Application Form:** Captures student credentials, a brief motivation statement, and current proficiency in data science and analytics tools.
- **Evaluation Dashboard:** A protected data table for the Core Team to review submissions side-by-side and toggle application statuses (Approved/Rejected).
- **Automated Provisioning:** Mutating a status to "Approved" triggers the email engine to dispatch the official DataCamp invitation link.

**Edge Cases & Errors:**

- **Allocation Cap:** The frontend must dynamically lock the application form and render a "Seats Exhausted" notice once the maximum number of scholarship allocations is reached.
- **Duplicate Applications:** Cross-references the scanned student number against the database to strictly prevent multiple submissions from the same user.

## **Developer Handoff & Documentation Standards**

- **Version Control (GitHub):** All source code must be maintained in the official QCU MSC GitHub Organization. The main branch is strictly protected; all features must be developed on separate branches and require a Pull Request (PR) review before merging. The repository must contain a comprehensive README.md detailing how to clone the project, install dependencies, and start the local development servers for the chosen stack.
- **API Documentation:** The backend team must maintain a live, shared API documentation hub (e.g., a Postman Workspace or Swagger/OpenAPI UI) containing every API endpoint. Each endpoint must document the required payload structure, HTTP method, and expected response codes (e.g., 200 OK, 400 Bad Request) so the frontend team can integrate without reading the backend source code.
- **Environment Variables:** An environment template file (e.g., `.env.example`) must be committed to the repository containing placeholder keys for the database URI, authentication secrets, and email transport credentials to ensure smooth onboarding for new developers.
- **Inline Code Documentation:** Regardless of the finalized tech stack (e.g., JSDoc for JavaScript/TypeScript, Docstrings for Python, or XML for C#), all major functions, UI components, and API controllers must feature standardized inline comments explaining their core purpose, parameters, and return types.

## Project Tasks

| Task ID & Name | Activity Description | Responsibility | Deadline |
| --- | --- | --- | --- |
| **1.1 V2 Database Extension** | Configure schemas for Events, Tickets, Showcase, Merch, and global Settings. Establish Admin inheritance typing. | Backend Team | July 20 – July 28 |
| **1.2 Event Logistics Foundation** | Build the Logistics UI, Event Creation form, and the Attendee relational data tables. | Frontend & Backend | July 20 – July 28 |
| **2.1 Superadmin Configuration** | Build the protected settings hub, user role manager, and global system toggles. | Full Stack Team | July 29 – August 6 |
| **2.2 Event Registration Flow** | Construct public `/events` routing, ID scan sign-up validation, and duplicate prevention logic. | Full Stack Team | July 29 – August 6 |
| **3.1 QR & Ticket Dispatch** | Implement automated email payload dispatch and build the mobile camera scanner route (`/admin/events/scan`). | Frontend & Backend | August 7 – August 15 |
| **3.2 Merch Catalog & Finance UI** | Build public merch catalog routing, reservation capture, and the Finance tracker data table. | Full Stack Team | August 7 – August 15 |
| **4.1 Incubation Showcase** | Develop the dynamic portfolio grid, URL validation, and Admin approval workflow. | Full Stack Team | August 16 – August 25 |
| **4.2 Analytics & Export** | Aggregate pipeline data into interactive UI charts and implement PDF export utilities. | Full Stack Team | August 16 – August 25 |
| **4.3 DataCamp Scholarship Gateway** | Build public intake form **with OCR integration**, Core Team evaluation data table, and automated invitation dispatch. | Full Stack Team | August 16 – August 25 |
|  |  |  |  |

## **MODULES**

---

# **Module 1 — Finance: Merch Pre-Order System**

## **Context**

The Finance Office manages the organization's merchandise operations. Every semester or academic year, the MSC releases an official merch drop — shirts, hoodies, IDs, lanyards, or similar items. In the current manual process, officers handle pre-orders informally through group chats and Google Forms, with GCash payments verified one by one and tracked on spreadsheets.

The V2 Merch Pre-Order System replaces that entirely. Finance officers upload merch to the portal, students browse and pre-order directly on the website, and GCash payments are verified through a structured reference-matching flow. The entire process — from catalog to claimed merch — lives in one place.

### **Who Uses the Merch (Finance) Module**

| **Actor** | **What They Do** |
| --- | --- |
| **Any student (guest or member)** | Browses the catalog, submits pre-orders, pays via GCash, tracks order status |
| **Finance Officer** (`ADMIN_FINANCE`) | Manages the catalog, verifies GCash payments, marks orders as claimed at pickup |
| **Finance Office Head** (`ADMIN_FINANCE_HEAD`) | Everything Finance Officers can do, plus: archives items, cancels orders at any stage, views analytics |
| **Superadmin** (`SUPERADMIN`) | Full access to all of the above |

## **Flow 1 — Finance Officer Adds Merch to Catalog**

Any Finance officer — whether an associate/sub-admin officer or the office head — can create and add merchandise directly to the student-facing catalog. Because no approval from higher roles is required, newly added items go live immediately upon creation.

A Finance officer logs into the admin portal and navigates to the Merch section. They create a new item by uploading product photos (front view, back view, detail shots), filling in the item name, description, price in PHP, and the available sizes or variants with their respective stock quantities (e.g., Size S: 50 units, Size M: 80 units, Size L: 60 units).

Once submitted, the item is immediately active and visible on the public website catalog — students can view it and start pre-ordering right away.

If adjustments are needed later, any Finance officer can edit item details (title, description, photos, prices, variant stock counts). If an item is discontinued or the ordering period ends, the Finance Office Head can archive or remove the item from the public catalog while preserving all past order records for audit.

## **Flow 2 — Student Fills Out a Pre-Order and Receives a Payment QR**

Any visitor to the QCU MSC website can browse the merch catalog without logging in. The catalog page shows all active items with photos, name, price, variants, and live stock counts. Each item has a dedicated page showing more photos and a breakdown of variant availability. Items running low on stock display a visible "Low Stock" indicator.

When a student decides to pre-order, they click the pre-order button. A form appears. If they are a logged-in Member or Applicant, their name, student ID, and email are pre-filled automatically. If they are a guest, they fill in their full name, QCU Student ID, email address, and GCash number manually. They then select their desired variant and enter the quantity.

Before submission, the system performs a real-time stock check on the selected variant. If the variant is out of stock at the moment of submission (even if it appeared available when the page loaded), the form returns an error:

> *"Sorry, the selected size is no longer available. Please choose a different size or check back later."* The student can select a different in-stock variant without losing their other form data.
> 

Upon successful submission, two things happen immediately:

**1. A unique Payment QR code is generated and displayed in the student portal.** The student sees a payment screen right on the website showing:

- The QCU MSC official GCash QR (encoded with the org's GCash number and the exact amount)
- The unique Order Reference ID (e.g. `MSC-MERCH-2026-0042`)
- Instruction: *"Scan this QR with your GCash app to pay ₱XXX.00. You will receive a GCash reference number after payment — come back here to submit it."*

**2. A confirmation email is sent** with the same QR code, order details, and instructions. The student can return to the order tracking page at any time via a link in the email.

The order is created with status **AWAITING_PAYMENT**. The student's selected variant stock is not reserved yet — stock is only locked in when the order reaches **CONFIRMED** status.

## **Flow 3 — Student Submits Screenshot and Reference Number**

After scanning the QR and completing the GCash payment, the student returns to their order page on the MSC portal (accessible from the payment screen or via the email link).

They are prompted to upload two things:

1. **A screenshot** of their completed GCash transaction
2. **Their GCash Reference Number** — the 13-digit transaction ID generated by GCash after a successful send

Before the submission is accepted, the system runs an **immediate duplicate reference check**: if the submitted reference number already exists in the database on any other order (confirmed, pending, or even rejected), the order is instantly moved to **REJECTED** with reason `DUPLICATE_REFERENCE`. The student receives an automated email:

> *"The GCash reference number you submitted has already been used on another order. If you believe this is an error, please contact the Finance team directly."* No Finance officer review is needed for duplicate references — this is handled automatically.
> 

If the reference number is unique, the order moves to **PENDING_VERIFICATION** and the student receives a confirmation email:

> *"Your payment proof has been received. Our Finance team will verify your payment shortly."*
> 

A student may submit multiple pre-orders for different items. Each is an independent order with its own QR code, its own reference number, and its own verification process. There is no cap on the number of orders, as long as each has a uniquely verified payment.

Using another person's GCash account to pay is permitted — the reference number is what matters for verification, not whose GCash number was used. The GCash number field on the form is recorded for reference only.

## **Flow 4 — Finance Officer Verifies or Rejects a Payment**

Every order in `PENDING_VERIFICATION` appears in the Finance officer's admin panel queue. Each entry shows: student name, student ID, item + variant ordered, amount due, GCash number used, the submitted reference number, and a thumbnail of the uploaded screenshot.

The officer opens their GCash app and checks their transaction history. They look for a transaction matching the submitted reference number and confirm:

1. The reference number exists in their GCash history
2. The amount received matches the order total

If both match — the officer clicks **"Confirm Payment."** The order moves to **CONFIRMED**. The variant stock count is decremented by the order quantity. The student receives an email confirming their pre-order is secured, along with pickup instructions.

**If verification fails — the Resubmit Flow:**

If the reference number is not found, the amount is wrong, or the screenshot is inconsistent, the officer clicks **"Reject"** and selects a reason from a predefined list:

- Reference number not found in GCash history
- Amount received does not match order total
- Screenshot is unclear or inconsistent with the reference number
- Other (free text)

The order moves to **REJECTED**. The student immediately receives an email with:

- The specific rejection reason
- A **"Resubmit Payment Proof"** button linking back to their order page

On their order page, the student sees the rejection reason clearly displayed and an unlocked form to submit a new screenshot and a new GCash reference number. They do not need to fill out a new pre-order — the order record is reused. Every submission attempt (screenshot + reference number) is logged with a timestamp, creating a full audit trail that Finance officers can review.

The resubmit flow re-enters `PENDING_VERIFICATION` and goes through the same duplicate reference check and officer review. There is no cap on resubmission attempts, but Finance officers can cancel a repeatedly problematic order and note the reason.

---

## **Flow 5 — Physical Pickup and Final Claim**

When the merch is ready for distribution, the Finance team coordinates the pickup schedule and communicates it to students (via email blast or the student portal announcement). The student presents themselves at the designated pickup point and identifies their order by name, student ID, or order reference.

The Finance officer finds the order in the admin panel (filtered to CONFIRMED orders) and clicks **"Mark as Claimed."** The order status moves to **PAID_AND_CLAIMED**. The student receives a final receipt email confirming their merch has been collected. The transaction is complete.

## **Edge Cases**

**Student types wrong amount:** Order is REJECTED with reason. The student must resend the correct amount via GCash, then resubmit with the new reference number from the corrected transaction. The original incorrect payment is handled offline by Finance (refund or reconciliation at their discretion).

**Duplicate GCash reference number:** Auto-rejected by the system instantly, no Finance officer review needed. Email sent to student explaining the duplicate.

**Stock runs out between form load and form submit:** Student sees a clear error on submission and is prompted to choose a different in-stock variant. Their other form data (name, contact info, quantity) is preserved so they only need to change the variant selection.

**Stock runs out after order is AWAITING_PAYMENT but before CONFIRMED:** The system does not reserve stock at submission time — only at confirmation. If the last unit is claimed by another student's confirmed order first, the Finance officer will see the stock discrepancy when confirming. In this case, the officer should reject the order with reason "Item out of stock" and contact the student directly to discuss a resolution (e.g., different variant, refund, or waitlisted for restock).

**Student uses another person's GCash:** Permitted. The reference number is what Finance verifies — not the account holder's identity. The GCash number on the form is logged for records only.

**Finance Head cancels a confirmed order:** Available only to `ADMIN_FINANCE_HEAD`. Used for exceptional cases (student withdrawal, item defect, event cancellation). Finance arranges refund offline. Cancelled order is logged with the head's note.

# **Module 2 — Logistics: Events & Registration System**

## **Context**

The Logistics Office manages all events the MSC runs — general assemblies, seminars, team-building activities, partner events, and more. Events may be open to all QCU students or restricted to MSC members only. Each event has a slot limit, a registration window, and may require a QR ticket for entry.

In V1, the basic event creation and registration system exists but is incomplete — editing events, cancelling events, and student self-cancellation are missing, and the QR check-in scanner has a critical bug that makes it unreachable. V2 fixes all of this and introduces the missing fields (banner image, registration deadline, year level/course capture) while simplifying the guest registration flow by removing the OCR requirement.

---

## **Who Uses This Module**

| **Actor** | **What They Do** |
| --- | --- |
| **Any student (guest or member)** | Browses events, registers for events, receives QR ticket via email |
| **Logistics Officer** (`ADMIN_LOGISTICS`) | Creates events, manages registrations, uses QR scanner at the door |
| **Logistics Office Head** (`ADMIN_LOGISTICS_HEAD`) | Everything officers can do, plus: cancels/deletes events, views analytics |
| **Superadmin** (`SUPERADMIN`) | Full access to all of the above |

## **Flow 1 — Logistics Officer Creates an Event**

A Logistics officer logs into the admin portal and opens the Events section. They click "Create Event" and fill in the following details:

- **Event name** — e.g., "MSC General Assembly AY2026 Semester 1"
- **Description** — what the event is about, what to expect
- **Date and time** — when the event takes place
- **Venue** — physical location
- **Event type** — Public (any QCU student can register) or Members Only (only active MSC members)
- **Maximum capacity** — the total number of slots available (e.g., 120)
- **Registration deadline** — the cutoff date and time after which no new registrations are accepted
- **Banner image** — an uploaded cover photo or event poster (stored in Azure Blob)
- **Requires QR ticket** — whether attendees need to present a QR code at the door

Once saved, the event is immediately visible on the public website. Members and non-members can begin registering right away if the registration window is open.

The officer can edit any of these details at any time — except that reducing capacity below the current confirmed registration count is blocked (you cannot set capacity to 80 if 95 students are already registered).

## **Flow 2 — Student Registers for an Event**

Any visitor to the MSC website can browse the events feed. Each event card shows the name, date, venue, event type badge, and how many slots remain. The registration experience differs based on the event type set by Logistics.

### **Type 1 — Members Only (`MEMBERS_ONLY`)**

Only authenticated users with the `MEMBER` role can register. Guests, Applicants, and non-MSC students are blocked immediately with a clear message:

> *"This event is exclusively for active MSC members. Please apply to the organization to join."*
> 

For authenticated Members, **all form fields are pre-filled** from their profile (name, student ID, course, year level, email) and are read-only. Registration is a single-confirm action.

---

### **Type 2 — QCU Students Only (`QCU_STUDENTS_ONLY`)**

Open to all QCU students — both MSC members and non-members. The experience differs by authentication status:

**If the registrant is an authenticated `MEMBER`:**

- All fields are pre-filled from their profile and read-only. Same frictionless one-confirm flow as Members Only.

**If the registrant is a non-member guest:**

- OCR verification is required before the registration form is shown.
- The guest must first complete `POST /api/v1/ocr/verify` — uploading their physical QCU Student ID card to verify enrollment.
- A valid `ocrSessionId` returned by the OCR endpoint must be submitted alongside the registration form.
- After OCR passes, the following fields are available to fill:
    - First name and last name
    - Course (e.g., BSCS)
    - Year level (e.g., 3rd Year)
    - Email address
    - `ocrSessionId` (from OCR step, submitted as a hidden field)
- `studentId` is resolved server-side from the OCR session — the student does not type it in.

The OCR step is the natural gate for this event type. A person without a valid QCU Student ID card will not be able to complete OCR and therefore cannot proceed to the registration form. If Logistics wants an event open to non-QCU attendees as well, they should use the `PUBLIC` event type instead.

---

### **Type 3 — Open to Public (`PUBLIC`)**

Anyone can register — QCU students, non-QCU students, alumni, guests. No OCR or authentication required.

All registrants fill in a simple form:

- First name and last name
- Email address
- QCU Student ID (optional — typed manually if they have one, left blank otherwise)
- Course and year level (optional)
- Industry, Company (optional)

Authenticated members still get their fields pre-filled for convenience.

---

---

---

## **Flow 3 — Registration Goes to PENDING**

Once a student submits their registration, the system performs several checks in order:

1. **Is registration still open?** — Has the deadline passed? Is the total slot limit full? Has a Logistics officer manually closed registration? If any of these are true, the student gets a clear error message.
2. **Event type access check:**
    - `MEMBERS_ONLY` → must be authenticated with `role = MEMBER`
    - `QCU_STUDENTS_ONLY` → members bypass; non-members must provide a valid `ocrSessionId`
    - `PUBLIC` → no authentication or OCR required
3. **Is this a duplicate?** — Has this student (by user account or by student ID) already registered for this event? If yes, blocked.
4. **Department cap check** — If the event has a per-department cap configured, and the student's course/department has already hit that cap, the registration is blocked. The student sees a generic "slots for your department are currently full" message. The specific cap number is never shown to students.

If all checks pass, a registration record is created with status **PENDING**. No QR code is issued yet. The student receives an email acknowledging their registration is received and under review.

The order of submission is recorded via `createdAt` timestamp — this is how first-come-first-serve priority is tracked for Logistics when they review the list.

---

## **Flow 4 — Logistics Officer Reviews and Approves Registrations**

After registrations come in, a Logistics officer opens the admin panel for that event. They see the full roster of PENDING registrations, sorted by submission time (earliest first — first come first serve order). Each row shows the student's name, student ID, course, year level, email, and the exact time they registered.

The officer works through the list and approves or rejects registrations. For most events, they simply approve in order until the capacity is filled — pure first come first serve. However, if the Logistics head configured a per-department cap for this event, the admin panel highlights when a department has exceeded its allocation, making it easy to spot and balance.

For example: if the event capacity is 120 and BSCS students occupy 90 of the first 100 pending slots, the officer may approve the 30 non-BSCS students first, then fill the remaining BSCS slots with the earliest BSCS registrants. Students who registered early but are skipped for department balancing are not automatically rejected — the officer can keep them PENDING and approve them if other departments don't fill their allocations.

When a registration is **APPROVED**, the system:

1. Generates a unique QR payload (UUID) for that registration
2. Sends the student an email containing the QR code image, event details, date, and venue

When a registration is **REJECTED**, the student receives an email explaining that registration was unsuccessful. No reason is exposed beyond a general message — department balancing is an internal logistics decision.

---

## **Flow 5 — Logistics Officer Configures Office Caps (Optional, Members Only Events)**

When creating or editing a `MEMBERS_ONLY` event, a Logistics officer can optionally configure per-office maximum member counts. This setting is **only available and only applies to `MEMBERS_ONLY` events** — it has no effect on `QCU_STUDENTS_ONLY` or `PUBLIC` events where office membership is not known. The setting is entirely hidden from members and does not appear on any student-facing page.

The cap is tied to the member's **MSC office** as stored in their profile — not their academic course. For example:

- Secretariat Office → max 20
- Finance Office → max 15
- Logistics Office → max 15
- Relations Office → max 10
- Creatives Office → max 10
- M&D Office → max 10
- Startup Developers → max 10

If no cap is set for an office, that office has no limit beyond the event's overall capacity. If the overall capacity is 120 but office caps are configured, the system still respects total capacity as the hard ceiling.

This feature is venue-driven and used for internal MSC events where leadership wants to ensure balanced representation across all offices.

---

## **Flow 6 — Logistics Officer Manually Toggles Registration**

Even if the event hasn't reached capacity and the deadline hasn't passed, a Logistics officer can manually close registration at any time from the admin panel. This is useful when:

- The physical venue has confirmed a lower final capacity than originally planned
- Logistics needs a headcount freeze before printing name tags or preparing materials
- The event review process needs to pause while the officer processes existing pending registrations

The toggle is a simple on/off switch. It can be turned back on just as easily — for example, if a batch of already-approved students cancels and Logistics wants to re-open slots.

---

## **Flow 7 — QR Scanner at the Venue Door**

On the day of the event, Logistics officers use the QR scanner — a mobile-friendly interface in the admin portal optimized for phone screens. The officer opens the scanner, grants camera access, and the scanner is live.

When an approved student arrives and presents their QR code (from their email), the officer scans it. The system:

1. Looks up the QR payload UUID in the database
2. Confirms it belongs to a registration for this specific event
3. Confirms the registration status is APPROVED
4. Confirms the student has not already been checked in (`hasAttended = false`)

If all checks pass: `hasAttended` is set to `true`, and the scanner shows a green confirmation screen with the student's name. The process takes under two seconds.

If any check fails, the scanner shows a red screen:

- **"Already checked in"** — student scanned twice
- **"Invalid QR code"** — QR doesn't match any registration
- **"Wrong event"** — QR belongs to a different event
- **"Not approved"** — registration is still PENDING or was REJECTED

For students who cannot display their QR code (lost email, phone dead, etc.), a Logistics officer can manually check them in by searching the roster by name or student ID and marking them attended from there.

---

## **Flow 8 — Logistics Head Cancels an Event**

Only the Logistics Office Head (or a Superadmin) can cancel an event. When a cancellation is triggered:

1. The event is marked as cancelled (soft delete — data is preserved for records)
2. The event disappears from the public events feed immediately
3. Every student with an APPROVED or PENDING registration receives an automated email notifying them of the cancellation

The Logistics Head enters a cancellation reason before confirming. This reason is included in the email sent to all affected registrants.

---

## **Edge Cases**

**Two students submit the last available slot at the same moment:** The system accepts both as PENDING — the total pending count can exceed capacity. It is the Logistics officer's job to approve up to the capacity limit and reject the rest. The `createdAt` timestamp determines who has priority.

**A student's department cap is full but the event isn't:** The student is blocked with a generic message. They cannot register even if other slots are technically open. Only Logistics can override this by adjusting the cap or manually approving an exception.

**Student loses QR code email:** The Logistics officer can manually check them in at the door using the roster search, or re-send the QR via the admin panel.

**Officer approves over the capacity limit:** The system prevents approving more registrations than `maxCapacity` allows. The approve button is disabled for events that are already at capacity.