# QCU MSC Central Portal - Product Requirement Document (PRD)
*July V1 Release*

---

## 1. Document Overview

**Project Name:** QCU MSC Central Portal (July V1 Release)

**Objective:** The primary digital hub for the independent QCU Microsoft Student Community. It serves as an automated acquisition engine to handle public branding, streamline the intake of new member applications with AI-assisted screening, manage event ticketing, and capture corporate sponsorship leads.

## 2. User Roles and Permissions

| Role | Description | Key Permissions |
|------|-------------|-----------------|
| Guest (External) | Unregistered visitor / Corporate Lead | Can view the public landing page and submit sponsorship inquiry forms. Cannot register for student events. |
| QCU Student (Non-Member) | General student body | Can view the landing page and register for "Public" organizational events to receive a QR ticket. |
| Applicant | Prospective MSC member | Has a registered account. Can access the private Applicant Portal to track application status, view internal notifications, and withdraw their application. |
| Member | Active QCU MSC student | Has a registered account. Gets early-access priority ticketing for events, bypasses the Zonal OCR for registration, and accesses a static "Coming Soon" placeholder on their dashboard. |
| Admin (Management & Dev) | Manages growth, onboarding, skill-building, and organizational documentation of human resources. | Has full access to the HR & Recruitment Pipeline. Can view and export sortable lists of applicant data, access portfolio links, mutate application statuses, and trigger automated or custom branded emails to candidates. |
| Admin (Logistics) | The engine of the organization, responsible for physical staging, event workflows, and technical backbones. | Has full access to Event Logistics & Check-In. Can create new event entries (setting capacity and type), view attendee rosters, utilize the mobile-friendly QR scanner route (`/admin/events/scan`) to validate tickets, and perform manual check-in overrides. |

---

> **⚠ IMPORTANT:** Guest (External) and QCU Student (Non-Member) share the same guest-level role with identical system permissions. They are listed separately only to distinguish the use case — corporate lead inquiries vs. student event registration.

## 3. Global Non-Functional Requirements

- **Performance:** All pages must achieve a Lighthouse score of 90+ for performance, with the landing page optimized for near-instant load times.
- **Security:**
  - Passwords must be hashed and salted (salt length minimum of 16 bytes).
  - API routes must be protected using JWT authentication (1 hour access tokens, 7 day refresh tokens).
  - Implement Rate Limiting on all public-facing POST routes (Application submissions, Login, Registration) to prevent bot spam and DDOS attacks.
  - Additional (optional): captcha
  - All user inputs (including text fields, file uploads, and URL submissions) must be validated and sanitized on the backend prior to database insertion to prevent Cross-Site Scripting (XSS) and SQL/NoSQL Injection attacks.
  - The web server must implement secure HTTP response headers, including Content-Security-Policy (CSP), Strict-Transport-Security (HSTS), and X-Frame-Options, to mitigate clickjacking and code injection.
  - The backend must generate secure, tamper-evident audit logs for all critical administrative actions (e.g., mutating application statuses, creating events, manual check-in overrides).
  - All failed login attempts and token generation requests must be logged to allow the detection of credential stuffing or targeted brute-force campaigns.
  - All client-server communications must be encrypted using TLS 1.2 or higher. Unencrypted HTTP traffic must be strictly rejected or automatically redirected to HTTPS.
- **Responsiveness:** The UI must be fully mobile-responsive, targeting a minimum viewport width of 320px.

## 4. Module Specifications

### Module Name: Unified Public Landing Page (Phases 1 & 5 Merged)

**Description:** A high-conversion, long-scroll landing page that introduces the organization, showcases industry prestige, highlights active events, and serves as the single entry point for student applications and corporate connections.

**User Story 1 (The Student):** As a prospective member, I want to understand the organization, see the leadership board, and view the "Wall of Logos" so I can verify your prestige before clicking "Apply."

**User Story 2 (The Attendee):** As a QCU student, I want to see a quick snapshot of upcoming workshops right on the homepage so I can easily route to the registration page.

**User Story 3 (The Industry Pro):** As a corporate lead, I want to see how other companies have collaborated with you and easily find the direct email for the Relations Office to initiate a partnership.

**Acceptance Criteria:**

- Hero & Branding: High-impact, statically rendered hero section matching QCU MSC branding guidelines.
- Active Initiatives Feed (Dynamic): A dedicated section fetching the top 3 upcoming active events client-side. Each card includes a "Register Now" routing to `/events`.
- The "Wall of Logos": A static grid displaying logos of past corporate collaborators.
- Dual CTAs: Prominent routing to the independent `/apply` portal, and a "Collaborate With Us" section featuring a direct, brand-aligned `mailto:` button (or a "Copy Email" clipboard function) pointing to the official Relations Office email.
- Social Footer: Hardcoded icon links to all official social media platforms.

**Edge Cases & Errors:**

- Database Failure (Graceful Degradation): If the `GET` request for the Active Initiatives feed fails or times out, the section must gracefully fallback to a static UI component stating: "Exciting initiatives are brewing for this semester! Follow our socials for the latest announcements."

### Module Name: Recruitment & Applicant Tracking

**Description:** The automated intake pipeline for new members, designed to securely capture applicant data and organize it for manual review by the Management & Development team.

**User Story 1:** As an applicant, I want to securely verify my student status using my QCU ID and submit my credentials, including my resume and portfolio links, through a clear, multi-step form so I can apply to join the community.

**Acceptance Criteria:**

- Zonal OCR Pre-Validation: Prior to accessing the main application form, the UI must prompt the user to capture an image of their QCU Student ID utilizing a guided camera overlay frame.
- Data Extraction & Sanitization: The system must crop the captured image to predefined layout coordinates (Zonal OCR) to isolate the student number. The extracted text must pass a strict Regex validation matching the official QCU student number format before allowing the user to proceed.
- Hidden Manual Fallback: To prevent system abuse and forced bypasses, manual entry of the student number is strictly hidden by default. The manual input and photo upload form will only render automatically after three consecutive failed OCR extraction or Regex validation attempts.
- Application Form: The form must logically guide the user through capturing basic information, their department preference, and mandatory portfolio/resume links.
- Post-Submission Account Creation: Immediately upon successful submission of the application form, the UI must route the user to a secure account creation screen.
- Credential Generation: The user will set a password paired with their verified QCU email.
- Applicant Dashboard Generation: Once the account is created, they are redirected to their new Applicant Dashboard, which displays a dynamic status tracker.

**Edge Cases & Errors:**

- Quarantine Routing: If an applicant submits via the manual ID fallback route, the backend must assign a hardcoded `Pending ID Verification` status to the payload, restricting them from the standard automated review pipeline until manually cleared by an Admin.
- Validation Errors: If an applicant attempts to submit without a valid URL format for their GitHub or resume link, highlight the missing or incorrect fields in red.

### Module Name: Authenticated User Portals (Applicant & Member)

**Description:** The secure, authenticated dashboard environment that dynamically changes based on the user's current role (Applicant vs. Member).

**User Story 1 (The Applicant):** As an applicant, I want to log in and see a clear status tracker for my application and any messages from the M&D team so I know exactly where I stand in the process.

**User Story 2 (The Member):** As a member, I want to log in and see a branded "Coming Soon" status screen so I know my account is successfully authenticated and ready for future updates.

**Acceptance Criteria:**

- Role-Based Routing: Upon successful login, the system must check the user's role. Applicants are routed to `/portal/tracking`, while Members are routed to `/portal/dashboard`.
- Applicant Tracking UI: Must display the current application status, a timeline of updates, and a notification inbox for M&D communications.
- Member Dashboard UI: Must exclusively display a static, minimalist "Coming Soon" teaser featuring a catchy status phrase (e.g., "Status 200: OK. Workspace Initialized."). Completely excludes event history, resource links, and digital ID cards for the V1 launch.
- Frictionless Event Registration: When a logged-in Member clicks "Register" on an event from the landing page, the system must automatically pull their credentials and dispatch the ticket, bypassing the Zonal OCR requirement entirely.

**Edge Cases & Errors:**

- Rejection State: If an applicant is rejected, their account role must change to a "Restricted" state where they can view their rejection notice but cannot access member resources or re-apply until the next intake period.

### Module Name: Event Registration & Ticketing

**Description:** The management system for technical workshops, seminars, and initiatives, featuring early-access ticketing to prioritize registered QCU MSC members.

**User Story 1 (The Priority Member):** As an active QCU MSC member, I want exclusive early access to event registrations so I can guarantee my slot before tickets run out.

**User Story 2 (The General Student):** As a non-member student, I want to scan my QCU ID to verify my enrollment and register for an open workshop without needing to create an account, so I can seamlessly receive my digital QR ticket.

**Acceptance Criteria:**

- Tiered Registration Phases: The Event database model must support two separate registration start times: a `priorityStartDate` and a `generalStartDate`.
- Account-Free General Admission: During the general registration window, non-member students are not required to log in. Instead, they must pass the Zonal OCR ID scan to access the registration form.
- Frictionless Data Capture: Upon successful OCR extraction, the form requires only the student's Name and Email address to facilitate ticket dispatch.
- Duplicate Registration Prevention: The backend must cross-reference the OCR-extracted student number against the current event's attendee roster. If the student number is already registered, the UI must block the submission to prevent ticket hoarding.
- Ticket Dispatch: Upon successful registration, the system generates a unique QR payload and emails it to the user.

**Edge Cases & Errors:**

- Provisional Registration (Fallback Queue): If a general student triggers the manual ID upload fallback due to repeated OCR failures, their registration is accepted but the QR ticket dispatch is withheld. The UI must display: "Registration pending. Your ticket will be emailed once an Admin verifies your ID."
- Logistics Approval: Fallback registrations are flagged in the admin dashboard. Once an Admin manually approves the uploaded photo against the typed student number, the backend automatically dispatches the delayed QR ticket via email.
- Members-Only Block: If a non-member attempts to register for an event flagged strictly as "Members-Only", the UI must permanently block the registration and prompt them to apply.

### Module Name: HR & Recruitment Pipeline with Communications Engine

**Description:** The dedicated workspace for the Management & Development team to process applicant data, mutate application statuses, and dispatch branded email communications.

**User Story 1 (Data Management):** As an M&D Officer, I want to view a sortable list of all applicants, manually resolve flagged ID verification errors, access their portfolio links, and update their application status.

**Acceptance Criteria:**

- Quarantine Queue (ID Verification): The Applicant Data Table must feature a distinct visual flag (e.g., a warning icon) for any user with a `Pending ID Verification` status.
- Manual Override Interface: Clicking on a quarantined applicant must open a specialized view displaying the user-uploaded ID photo side-by-side with their manually typed student number. The Admin must click "Approve ID" to unlock the standard Status Mutator & Email Trigger functionality.
- Status Mutator & Email Trigger: Changing an applicant's status should open a confirmation modal.

**Edge Cases & Errors:**

- SMTP Failure: If the email service fails, revert the UI state and display a prominent error: "Failed to dispatch email. Status not updated".

### Module Name: Event Logistics & Check-In (Logistics Office)

**Description:** The control center for creating public events and managing the attendees who register through the public `/events` route.

**User Story 1:** As a Logistics Officer, I want to create a new event entry so it automatically appears on the public website for students to register.

**User Story 2:** As a Logistics Officer at the venue doors, I want to scan a student's digital QR ticket using my phone so I can validate their registration and mark them as "Attended."

**Acceptance Criteria:**

- Event Creation Form: Admin can input Event Title, Date, Type (Public/Members-Only), and Max Capacity.
- Attendee Roster: A view for each specific event showing all registered users and their check-in status.
- QR Scanner: A dedicated mobile-friendly route (`/admin/events/scan`) that utilizes the device camera to read the QR payload, validates the UUID against the Event database, and flips a boolean `hasAttended` flag.
- Manual Override: A search bar to manually check in a student if their screen is cracked or the QR scanner fails.

**Edge Cases & Errors:**

- If the scanner reads a QR code that does not belong to the specific event (or is a fake/duplicate), display a prominent red error: "Invalid QR code." or "This ticket has already been checked in."

## 5. Developer Handoff & Documentation Standards

To ensure the longevity and maintainability of the Central Portal for future executive boards, the following documentation standards are strictly required for the V1 launch.

- **Version Control (GitHub):** All source code must be maintained in the official QCU MSC GitHub Organization. The `main` branch is strictly protected; all features must be developed on separate branches and require a Pull Request (PR) review before merging. The repository must contain a comprehensive `README.md` detailing how to clone the project, install dependencies, and start the local development servers for the chosen stack.

- **API Documentation:**
  - The backend team must maintain a live, shared API documentation hub (e.g., a Postman Workspace or Swagger/OpenAPI UI) containing every API endpoint.
  - Each endpoint must document the required payload structure, HTTP method, and expected response codes (e.g., `200 OK`, `400 Bad Request`) so the frontend team can integrate without reading the backend source code.

- **Environment Variables:**
  - An environment template file (e.g., `.env.example`) must be committed to the repository containing placeholder keys for the database URI, authentication secrets, and email transport credentials to ensure smooth onboarding for new developers.

- **Inline Code Documentation:**
  - Regardless of the finalized tech stack (e.g., JSDoc for JavaScript/TypeScript, Docstrings for Python, or XML for C#), all major functions, UI components, and API controllers must feature standardized inline comments explaining their core purpose, parameters, and return types.

## 6. Out of Scope (V2 Roadmap)

The following features are explicitly excluded from the July V1 Minimum Viable Product to protect the deployment timeline. They represent the sole focus for the post-launch development cycle.

- **V2.1 - Project Incubation Showcase:** A dynamic, filterable portfolio grid designed for the Startup Developers. This public-facing module will display live deployed web applications, GitHub repositories, and data visualization models, serving as a digital resume for the community's technical talent.
- **V2.2 - Executive Data Analytics Dashboard:** An internal command center for the Core Team. This module will aggregate data from the HR, Events, and Relations pipelines into visual, interactive charts, providing automated health metrics and reporting capabilities for executive board meetings.
