# QCU MSC Central Portal - Product Requirement Document (PRD)
*July V1 Release*

---

## 1. Document Overview

* **Project Name:** QCU MSC Central Portal (July V1 Release)
* **Objective:** The primary digital hub for the independent QCU Microsoft Student Community. It serves as an automated acquisition engine to handle public branding, streamline the intake of new member applications with AI-assisted screening, manage event ticketing, and capture corporate sponsorship leads.

---

## 2. User Roles and Permissions

| Role | Description | Key Permissions |
| :--- | :--- | :--- |
| **Guest (External)** | Unregistered visitor / Corporate Lead | Can view the public landing page and submit sponsorship inquiry forms. Cannot register for student events. |
| **QCU Student (Non-Member)** | General student body | Can view the landing page and register for "Public" organizational events to receive a QR ticket. |
| **Applicant** | Prospective MSC member | Can access the application portal, submit resume/GitHub links. |
| **Member** | Active QCU MSC student | Can register for all events (both "Public" and "Members-Only") and access internal community resources. |
| **Admin** | Core Team (M&D, Relations, etc.) | Full access. Can view/export applicant data, manage event capacities, scan QR codes, and review corporate leads. |

---

## 3. Global Non-Functional Requirements

* **Performance:** All pages must achieve a Lighthouse score of 90+ for performance, with the landing page optimized for near-instant load times.
* **Security:** Passwords must be hashed. API routes must be protected using JWT authentication.
* **Responsiveness:** The UI must be fully mobile-responsive, targeting a minimum viewport width of 320px.

---

## 4. Module Specifications

### Module: Unified Public Landing Page (Phases 1 & 5 Merged)
* **Description:** A high-conversion, long-scroll landing page that introduces the organization, showcases industry prestige, highlights active events, and serves as the single entry point for student applications and corporate connections.

#### User Stories
* **User Story 1 (The Student):** As a prospective member, I want to understand the organization, see the leadership board, and view the "Wall of Logos" so I can verify your prestige before clicking "Apply."
* **User Story 2 (The Attendee):** As a QCU student, I want to see a quick snapshot of upcoming workshops right on the homepage so I can easily route to the registration page.
* **User Story 3 (The Industry Pro):** As a corporate lead, I want to see how other companies have collaborated with you and easily find the direct email for the Relations Office to initiate a partnership.

#### Acceptance Criteria
* **Hero & Branding:** High-impact, statically rendered hero section matching QCU MSC branding guidelines.
* **Active Initiatives Feed (Dynamic):** A dedicated section fetching the top 3 upcoming active events client-side. Each card includes a "Register Now" routing to `/events`.
* **The "Wall of Logos":** A static grid displaying logos of past corporate collaborators.
* **Dual CTAs:** Prominent routing to the independent `/apply` portal, and a "Collaborate With Us" section featuring a direct, brand-aligned `mailto:` button (or a "Copy Email" clipboard function) pointing to the official Relations Office email.
* **Social Footer:** Hardcoded icon links to all official social media platforms.

#### Edge Cases & Errors
* **Database Failure (Graceful Degradation):** If the `GET` request for the Active Initiatives feed fails or times out, the section must gracefully fallback to a static UI component stating: *"Exciting initiatives are brewing for this semester! Follow our socials for the latest announcements."*

---

### Module: Recruitment & Applicant Tracking
* **Description:** The automated intake pipeline for new members, designed to securely capture applicant data and organize it for manual review by the Management & Development team.

#### User Stories
* **User Story 1:** As an applicant, I want to submit my credentials, including my resume and portfolio links, through a clear, multi-step form so I can apply to join the community.

#### Acceptance Criteria
* The form must logically guide the user through capturing basic information, their department preference, and mandatory portfolio/resume links.
* Upon successful submission, the data is saved to the database, the form resets, and a success confirmation UI is displayed.
* The submitted data must immediately become visible in the Admin-only data table for review.

#### Edge Cases & Errors
* If an applicant attempts to submit without a valid URL format for their GitHub or resume link, highlight the missing or incorrect fields in red and disable the final submit button.
* If the database fails to save, display a user-friendly error message asking them to try again later.

---

### Module: Event Registration & Ticketing
* **Description:** The management system for technical workshops, seminars, and initiatives open to the wider campus.

#### User Stories
* **User Story 1:** As a student (member or non-member), I want to register for an open workshop and receive a digital QR ticket so I can secure my slot and check in easily.

#### Acceptance Criteria
* The registration route must accept both active Members and Non-Member Students, deducting from the event's total capacity.
* Upon success, the system generates a unique QR payload and emails it to the user.

#### Edge Cases & Errors
* If a Non-Member attempts to register for an event flagged as "Members-Only" in the database, the UI must block the registration and prompt them to apply to the organization.

---

### Module: HR & Recruitment Pipeline with Communications Engine
* **Description:** The dedicated workspace for the Management & Development team to process applicant data, mutate application statuses, and dispatch branded email communications directly to candidates.

#### User Stories
* **User Story 1 (Data Management):** As an M&D Officer, I want to view a sortable list of all applicants, access their portfolio links, and update their application status.
* **User Story 2 (Communication):** As an M&D Officer, I want to trigger automated, branded emails (e.g., Interview Invites, Acceptance Letters, Rejection Notices) directly from the dashboard so I can maintain professional and rapid communication with applicants.

#### Acceptance Criteria
* **Applicant Data Table:** Displays columns for Name, Email, Department Choice, and Status.
* **Status Mutator & Email Trigger:** Changing an applicant's status (e.g., to Interviewing or Accepted) should open a confirmation modal asking, *"Send [Status] email to candidate?"*
* **Email Templates:** The backend must utilize pre-built HTML templates that strictly match the organization's color palette, typography, and logo.
* **Manual Email Option:** A "Send Message" button inside the applicant's detail view that allows the officer to type a custom message, which is then wrapped in the branded HTML template before sending.

#### Edge Cases & Errors
* If the SMTP server or email service fails to send the message, revert the UI state, keep the applicant in their previous status, and display a prominent error: *"Failed to dispatch email. Status not updated."*

---

### Module: Event Logistics & Check-In (Logistics Office)
* **Description:** The control center for creating public events and managing the attendees who register through the public `/events` route.

#### User Stories
* **User Story 1:** As a Logistics Officer, I want to create a new event entry so it automatically appears on the public website for students to register.
* **User Story 2:** As a Logistics Officer at the venue doors, I want to scan a student's digital QR ticket using my phone so I can validate their registration and mark them as "Attended."

#### Acceptance Criteria
* **Event Creation Form:** Admin can input Event Title, Date, Type (Public/Members-Only), and Max Capacity.
* **Attendee Roster:** A view for each specific event showing all registered users and their check-in status.
* **QR Scanner:** A dedicated mobile-friendly route (`/admin/events/scan`) that utilizes the device camera to read the QR payload, validates the UUID against the Event database, and flips a boolean `hasAttended` flag.
* **Manual Override:** A search bar to manually check in a student if their screen is cracked or the QR scanner fails.

#### Edge Cases & Errors
* If the scanner reads a QR code that does not belong to the specific event (or is a fake/duplicate), display a prominent red error: *"Invalid Ticket or Already Scanned."*

---

## 5. Developer Handoff & Documentation Standards

To ensure the longevity and maintainability of the Central Portal for future executive boards, the following documentation standards are strictly required for the V1 launch:

* **Version Control (GitHub):**
  * All source code must be maintained in the official QCU MSC GitHub Organization.
  * The `main` branch is strictly protected; all features must be developed on separate branches and require a Pull Request (PR) review before merging.
  * The repository must contain a comprehensive [README.md](file:///c:/Users/busti/Desktop/Node/x/qcu-msc-central-portal-backend/README.md) detailing how to clone the project, install dependencies, and start the local development servers for the chosen stack.
* **API Documentation:**
  * The backend team must maintain a live, shared API documentation hub (e.g., a Postman Workspace or Swagger/OpenAPI UI) containing every API endpoint.
  * Each endpoint must document the required payload structure, HTTP method, and expected response codes (e.g., `200 OK`, `400 Bad Request`) so the frontend team can integrate without reading the backend source code.
* **Environment Variables:**
  * An environment template file (e.g., `.env.example`) must be committed to the repository containing placeholder keys for the database URI, authentication secrets, and email transport credentials to ensure smooth onboarding for new developers.
* **Inline Code Documentation:**
  * Regardless of the finalized tech stack (e.g., JSDoc for JavaScript/TypeScript, Docstrings for Python, or XML for C#), all major functions, UI components, and API controllers must feature standardized inline comments explaining their core purpose, parameters, and return types.

---

## 6. Out of Scope (V2 Roadmap)

The following features are explicitly excluded from the July V1 Minimum Viable Product to protect the deployment timeline. They represent the sole focus for the post-launch development cycle:

* **V2.1 - Project Incubation Showcase:** A dynamic, filterable portfolio grid designed for the Startup Developers. This public-facing module will display live deployed web applications, GitHub repositories, and data visualization models, serving as a digital resume for the community's technical talent.
* **V2.2 - Executive Data Analytics Dashboard:** An internal command center for the Core Team. This module will aggregate data from the HR, Events, and Relations pipelines into visual, interactive charts, providing automated health metrics and reporting capabilities for executive board meetings.
