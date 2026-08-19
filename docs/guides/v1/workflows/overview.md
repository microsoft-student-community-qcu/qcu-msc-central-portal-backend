# Workflows — Overview

## Introduction

This directory documents the primary business workflows and user journeys in the QCU MSC Central Portal, split by topic for focused reference.

| Topic | File | Description |
|-------|------|-------------|
| Authentication | [auth-workflow.md](auth-workflow.md) | Registration, login, email verification |
| Applicant Tracking | [applicant-tracking.md](applicant-tracking.md) | Membership application pipeline for ADMIN_HR |
| Event Management | [event-management.md](event-management.md) | Create event, register, check-in, cancel |
| RBAC & Authorization | [rbac.md](rbac.md) | Role hierarchy and endpoint protection |
| Email Notifications | [email-notifications.md](email-notifications.md) | Triggered email templates per event |

## User Journeys

| Persona | Goal | Entry Point |
|---------|------|-------------|
| Guest / Corporate Lead | Initiate sponsorship | Landing Page → "Collaborate With Us" |
| Guest / QCU Student | Register for public event | Landing Page → `/events` → Zonal OCR |
| Applicant | Apply for membership | Landing Page → "Apply" CTA → Zonal OCR |
| Member | Priority event registration | Login → Member Dashboard |
| ADMIN_HR | Process applications | Login → `/admin/hr` |
| ADMIN_LOGISTICS | Deploy & check-in events | Login → `/admin/events` |

---

## Revision History

| Date | Change |
|------|--------|
| 2026-07-02 | Workflows split into per-topic files; updated applicant tracking with new fields, statuses, and admin endpoints; added RBAC entries for new applicant routes |
