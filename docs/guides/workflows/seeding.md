# Seeding

`prisma/seed.ts` is the single source of truth for mock data. It is **idempotent** — re-runs skip existing records (matched by email, `studentId`, and `ocrSessionId`).

## When it runs

| Environment | How it runs |
|---|---|
| Local development | `npx prisma db seed` (uses your local `.env` → `DATABASE_URL`) |
| `develop` deploys | CI/CD runs `npx prisma db seed` during the deploy (DB is reached from the pipeline runner) |
| `release` deploys | Same as above |
| `main` / production | Never — CI/CD skips seeding on `main`, and the seed hard-refuses when `NODE_ENV=production\|release`, `BRANCH_NAME=main`, or `GITHUB_REF_NAME=main` |

## What it creates

| Records | Count | Details |
|---|---|---|
| Bulk users + accounts | 300 | via Better Auth (real hashed passwords). 75 `MEMBER` (approved applicants) + 225 `APPLICANT` |
| Admins | 10 | 5 × `ADMIN_HR`, 5 × `ADMIN_LOGISTICS` |
| Applicants | 300 | one per bulk user, linked via `userId`; realistic status spread |
| Application drafts | 150 | across form steps 0–3, deterministic UUID `ocrSessionId`s |

## Logins

- **Bulk users** (members + applicants): password `SeedPass123!` (override with `SEED_USER_PASSWORD`)
- **Admins**: password `AdminPass123!` (override with `SEED_ADMIN_PASSWORD`)
- All emails (bulk users, admins, drafts) follow `lastname.firstname.mi@gmail.com` (e.g. `santos.juan.a@gmail.com`). On the rare generated name collision, a digit is appended (`santos.juan.a2@gmail.com`).
- The seed output prints the full admin email list — run it to get the current admin logins.

### Student ID format

`YY-NNNN`, e.g. `23-2583`.

- **Year** = enrollment year, correlated with the section year level: 4th year → `23`, 3rd → `24`, 2nd → `25`, 1st → `26`. A few irregular students get `21`–`22`.
- **Number** ranges `1000`–`2900` and is unique per seeded record.

### Document fields (fixed mock URLs)

All seeded applicants and drafts use these shared dev-storage blob URLs:

- `idImagePath` → `https://stsamscqcubackenddev.blob.core.windows.net/ocr/ocr_1785936580931_student-id.png`
- `certificateOfRegistration` → `https://stsamscqcubackenddev.blob.core.windows.net/documents/cor_draft_1785936630204_cor.png`
- `curriculumVitae` → `https://stsamscqcubackenddev.blob.core.windows.net/documents/cv_draft_1785936630303_cv-pdf.pdf`

## Real QCU colleges & programs (seed-only reference)

| College | Programs (section code) |
|---|---|
| College of Computer Studies | BS Information Technology (`IT`), BS Computer Science (`CS`), BS Information Systems (`IS`) |
| College of Engineering | BS Industrial Engineering (`IE`), BS Electronics Engineering (`EC`) |
| College of Business Administration and Accountancy | BS Accountancy (`AC`), BS Entrepreneurship (`ENT`) |
| College of Education | Bachelor of Early Childhood Education (`ECE`) |

### Section format

`{BRANCH}{PROGRAM_CODE}-{YEAR}{SECTION_LETTER}`, e.g. `SBIT-3I`.

- Branch: `SB` = San Bartolome (main), `BA` = Batasan, `SF` = San Francisco — always matches the applicant's `campus`.
- Year level: 1–4. Section letter: A–Q.
