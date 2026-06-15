# QCU MSC Central Portal: V1 Development Timeline & Milestones
*Document Name: MSC Central Portal - V1 Master Blueprint Timeline*

---

## Metadata
* **Launch Target:** Mid-July 2026
* **Sprint Duration:** 4 Weeks (June 15, 2026 – July 12, 2026)
* **Methodology:** Agile / Parallel Development

---

## Week 1: Infrastructure & The Front Door (June 15 – June 21)

| Task ID | Activity | Responsibility |
| :--- | :--- | :--- |
| **1.1** | **Environment Initialization:** Initialize version control repository, set up branch protections (`main` and `dev`), distribute `.env.example`, configure styling framework to match brand palette, and connect to database cluster. | Head Dev, Frontend Team, Backend Team |
| **1.2** | **Database Foundation:** Configure schemas/models for `Applicant`, `Event`, and `Admin` with strict data typing interfaces across the stack. | Backend Team |
| **1.3** | **Unified Landing Page:** Build responsive Hero, "Meet the Board," "Wall of Logos," `mailto:` integration, and dynamic Active Initiatives feed. | Frontend Team |

---

## Week 2: The Acquisition Engine (June 22 – June 28)

| Task ID | Activity | Responsibility |
| :--- | :--- | :--- |
| **2.1** | **Recruitment Portal:** Build multi-step `/apply` form with client-side validation (GitHub/Drive links) and recruitment API routes. | Frontend & Backend |
| **2.2** | **Ticketing System:** Create dynamic `/events` feed, registration UI, and registration routes with ticket generation logic. | Frontend & Backend |
| **2.3** | **Cross-Team Integration:** Verify payload integrity between frontend and local backend server without cross-origin or type errors. | Head Dev |

---

## Week 3: The Internal Command Center (June 29 – July 5)

| Task ID | Activity | Responsibility |
| :--- | :--- | :--- |
| **3.1** | **Security & Auth:** Implement auth protocols, password hashing for Core Team, and secure API endpoints via middleware. | Backend Team |
| **3.2** | **HR & Logistics Dashboards:** Build protected data tables (`/admin/hr` and `/admin/events`) and Event Creation Form using component libraries. | Frontend & Backend |
| **3.3** | **Data & Scanner:** Implement CSV export with UPPERCASE naming (e.g., `STATUS`), QR scanner integration, and manual check-in override. | Full Stack Team |

---

## Week 4: Communications, QA, & Launch (July 6 – July 12)

| Task ID | Activity | Responsibility |
| :--- | :--- | :--- |
| **4.1** | **Email Engine:** Integrate brand-aligned HTML templates with transport services linked to status changes and registration triggers. | Frontend & Backend |
| **4.2** | **System QA:** Testing of mobile QR check-in and HR status mutation/email pipeline with dummy data and CSV export. | Logistics & M&D Heads |
| **4.3** | **Deployment:** Configure production hosting environment, secure environment variables, and official go-live deployment. | Head Dev |
