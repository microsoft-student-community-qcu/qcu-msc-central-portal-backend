# Event Management & Registration API

## Overview
The Event Management API handles creation, management, and registration for workshops, seminars, and initiatives. Supports both public and members-only events with capacity management.

---

## Endpoints

### 1. Create Event

**Description:**  
Creates a new workshop, seminar, or initiative event. Only ADMIN_LOGISTICS users can create events.

**Method:** `POST`  
**Path:** `/api/v1/events`

**Authentication:** Required (Bearer token, ADMIN_LOGISTICS only)

**Request Parameters:**
- `title` (string, required): Event title (1-150 characters)
- `description` (string, optional): Event description (max 1000 characters)
- `date` (string, required): Event date in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ)
- `priorityStartDate` (string, required): When Members can start registering (ISO 8601)
- `generalStartDate` (string, required): When general admission opens (ISO 8601, must be after `priorityStartDate`)
- `type` (enum, optional): Event visibility - `PUBLIC` or `MEMBERS_ONLY`. Defaults to `PUBLIC`
- `maxCapacity` (number, required): Maximum number of attendees (positive integer)

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "id": string (UUID),
    "title": string,
    "description": string | null,
    "date": string (ISO 8601),
    "priorityStartDate": string (ISO 8601),
    "generalStartDate": string (ISO 8601),
    "type": "PUBLIC" | "MEMBERS_ONLY",
    "maxCapacity": number,
    "createdAt": string (ISO 8601)
  },
  "message": string
}
```

**Example Request:**
```bash
curl -X POST http://localhost:5000/api/v1/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "title": "Python Workshop 2026",
    "description": "Learn advanced Python programming techniques",
    "date": "2026-07-15T14:00:00Z",
    "priorityStartDate": "2026-07-01T09:00:00Z",
    "generalStartDate": "2026-07-03T09:00:00Z",
    "type": "PUBLIC",
    "maxCapacity": 50
  }'
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "title": "Python Workshop 2026",
    "description": "Learn advanced Python programming techniques",
    "date": "2026-07-15T14:00:00Z",
    "priorityStartDate": "2026-07-01T09:00:00Z",
    "generalStartDate": "2026-07-03T09:00:00Z",
    "type": "PUBLIC",
    "maxCapacity": 50,
    "createdAt": "2026-06-15T10:30:00Z"
  },
  "message": "Event created successfully"
}
```

---

### 2. Get Event by ID

**Description:**  
Retrieves details of a specific event.

**Method:** `GET`  
**Path:** `/api/v1/events/:eventId`

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "id": string,
    "title": string,
    "description": string | null,
    "date": string (ISO 8601),
    "priorityStartDate": string (ISO 8601),
    "generalStartDate": string (ISO 8601),
    "type": "PUBLIC" | "MEMBERS_ONLY",
    "maxCapacity": number,
    "registeredCount": number,
    "spotsRemaining": number,
    "createdAt": string (ISO 8601),
    "updatedAt": string (ISO 8601)
  },
  "message": string
}
```

**Example Request:**
```bash
curl -X GET http://localhost:5000/api/v1/events/770e8400-e29b-41d4-a716-446655440002
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "title": "Python Workshop 2026",
    "description": "Learn advanced Python programming techniques",
    "date": "2026-07-15T14:00:00Z",
    "priorityStartDate": "2026-07-01T09:00:00Z",
    "generalStartDate": "2026-07-03T09:00:00Z",
    "type": "PUBLIC",
    "maxCapacity": 50,
    "registeredCount": 12,
    "spotsRemaining": 38,
    "createdAt": "2026-06-15T10:30:00Z",
    "updatedAt": "2026-06-15T10:30:00Z"
  },
  "message": "Event retrieved successfully"
}
```

---

### 3. List All Events

**Description:**  
Retrieves all events with optional filtering by type or date range.

**Method:** `GET`  
**Path:** `/api/v1/events`

**Query Parameters:**
- `type` (optional): Filter by type - `PUBLIC` or `MEMBERS_ONLY`
- `startDate` (optional): Filter events from this date (ISO 8601)
- `endDate` (optional): Filter events until this date (ISO 8601)
- `limit` (optional): Number of records to return (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "total": number,
    "events": [
      {
        "id": string,
        "title": string,
        "date": string,
        "type": string,
        "maxCapacity": number,
        "registeredCount": number
      }
    ]
  },
  "message": string
}
```

**Example Request:**
```bash
curl -X GET "http://localhost:5000/api/v1/events?type=PUBLIC&limit=20"
```

---

### 4. Update Event

**Description:**  
Updates event details. Only ADMIN_LOGISTICS users can update events.

**Method:** `PATCH`  
**Path:** `/api/v1/events/:eventId`

**Authentication:** Required (Bearer token, ADMIN_LOGISTICS only)

**Request Parameters:**
- `title` (string, optional): Updated title
- `description` (string, optional): Updated description
- `date` (string, optional): Updated date
- `type` (enum, optional): Updated type
- `maxCapacity` (number, optional): Updated max capacity

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "id": string,
    "title": string,
    "description": string | null,
    "date": string (ISO 8601),
    "type": "PUBLIC" | "MEMBERS_ONLY",
    "maxCapacity": number,
    "updatedAt": string (ISO 8601)
  },
  "message": string
}
```

**Example Request:**
```bash
curl -X PATCH http://localhost:5000/api/v1/events/770e8400-e29b-41d4-a716-446655440002 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "maxCapacity": 75
  }'
```

---

### 5. Delete Event

**Description:**  
Deletes an event and all associated registrations. Only ADMIN_LOGISTICS users can delete events.

**Method:** `DELETE`  
**Path:** `/api/v1/events/:eventId`

**Authentication:** Required (Bearer token, ADMIN_LOGISTICS only)

**Response Format:**
```json
{
  "success": boolean,
  "message": string
}
```

**Example Request:**
```bash
curl -X DELETE http://localhost:5000/api/v1/events/770e8400-e29b-41d4-a716-446655440002 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Event Registration Endpoints

### 6. Register for Event

**Description:**  
Registers a guest (no account required) or an authenticated member for an event. Guest registrations must first call `POST /api/v1/ocr/verify` to obtain an `ocrSessionId`. Authenticated members bypass OCR and use their profile data automatically. The endpoint generates a QR payload for event check-in.

---

### 7. Review Pending Manual Registration

**Description:**  
Allows ADMIN_LOGISTICS to approve or reject registrations that were flagged for manual review after OCR failure.

**Method:** `PATCH`  
**Path:** `/api/v1/events/:eventId/registrations/:registrationId/approve`

**Authentication:** Required (Bearer token, ADMIN_LOGISTICS only)

**Request Body:**
```json
{
  "action": "approve"
}
```
or
```json
{
  "action": "reject"
}
```

**Response Format:**
```json
{
  "success": true,
  "data": {
    "registrationId": "string",
    "eventId": "string",
    "status": "APPROVED | REJECTED",
    "action": "approve | reject"
  },
  "message": "Registration approved successfully"
}
```

**Example Request:**
```bash
curl -X PATCH http://localhost:5000/api/v1/events/770e8400-e29b-41d4-a716-446655440002/registrations/6f0f8d3d-7b36-4c0e-b31b-91be7b4e6cb9/approve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{"action":"approve"}'
```

**Method:** `POST`  
**Path:** `/api/v1/events/:eventId/register`

**Request Parameters:**
- `lastName` (string, required): Attendee's last name (1-100 characters)
- `firstName` (string, required): Attendee's first name (1-100 characters)
- `middleInitial` (string, optional): Middle initial, single letter optionally followed by a dot
- `email` (string, required): Attendee's email address
- `studentId` (string, optional): QCU Student ID in `YY-NNNN` format; required for guest registrations and used when OCR cannot extract it
- `ocrSessionId` (string, optional): OCR session token returned from `POST /api/v1/ocr/verify`
- `userId` (string, optional): User ID if the attendee is already authenticated (auto-attached server-side from JWT)

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "registrationId": string,
    "eventId": string,
    "lastName": string,
    "firstName": string,
    "middleInitial": string | null,
    "email": string,
    "status": "APPROVED" | "PENDING_REVIEW",
    "manual_registration": boolean,
    "qrPayload": string,
    "hasAttended": boolean,
    "createdAt": string (ISO 8601)
  },
  "message": string
}
```

**Example Request (Guest):**
```bash
curl -X POST http://localhost:5000/api/v1/events/770e8400-e29b-41d4-a716-446655440002/register \
  -H "Content-Type: application/json" \
  -d '{
    "lastName": "Johnson",
    "firstName": "Alex",
    "email": "alex@example.com",
    "studentId": "23-5678",
    "ocrSessionId": "990e8400-e29b-41d4-a716-446655440004"
  }'
```

**Example Response (Guest — Auto-Approved):**
```json
{
  "success": true,
  "data": {
    "registrationId": "880e8400-e29b-41d4-a716-446655440003",
    "eventId": "770e8400-e29b-41d4-a716-446655440002",
    "lastName": "Johnson",
    "firstName": "Alex",
    "middleInitial": null,
    "email": "alex@example.com",
    "status": "APPROVED",
    "manual_registration": false,
    "qrPayload": "880e8400-e29b-41d4-a716-446655440003",
    "hasAttended": false,
    "createdAt": "2026-06-15T11:00:00Z"
  },
  "message": "Registration successful"
}
```

---

### 7. Get Event Registrations

**Description:**  
Retrieves all registrations for a specific event, including attendance and capacity summary. Only ADMIN_LOGISTICS can view this roster.

**Method:** `GET`  
**Path:** `/api/v1/events/:eventId/registrations`

**Authentication:** Required (Bearer token, ADMIN_LOGISTICS only)

**Query Parameters:**
- `status` (optional): Filter by registration status — `APPROVED`, `PENDING_REVIEW`, `REJECTED`, `CANCELLED`
- `hasAttended` (optional): Filter by attendance status (`true`/`false`)

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "event": {
      "id": string,
      "title": string,
      "date": string (ISO 8601),
      "maxCapacity": number,
      "registeredCount": number,
      "spotsRemaining": number
    },
    "total": number,
    "registrations": [
      {
        "id": string,
        "lastName": string,
        "firstName": string,
        "middleInitial": string | null,
        "email": string,
        "status": "APPROVED" | "PENDING_REVIEW" | "REJECTED" | "CANCELLED",
        "hasAttended": boolean,
        "createdAt": string (ISO 8601)
      }
    ]
  },
  "message": string
}
```

---

### 8. QR Check-In

**Description:**  
Validates a QR payload for the current event and marks the registration as attended. This is intended for QR scanner workflows and returns a generic error for invalid or already-used tickets.

**Method:** `PATCH`  
**Path:** `/api/v1/events/:eventId/registrations/checkin`

**Authentication:** Required (Bearer token, ADMIN_LOGISTICS only)

**Request Body:**
```json
{
  "qrPayload": "<qr payload string>"
}
```

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "registrationId": string,
    "name": string,
    "hasAttended": true
  },
  "message": string
}
```

**Status Codes:**
- `200`: Check-in successful
- `400`: Invalid ticket, duplicate scan, or registration not approved for check-in
- `404`: Event not found
- `500`: Internal server error

---

### 9. Manual Check-In Override

**Description:**  
Allows logistics staff to manually mark a registration as attended by registration ID when QR scanning is unavailable or fails. This is useful for cracked screens or damaged QR passes.

**Method:** `PATCH`  
**Path:** `/api/v1/events/:eventId/registrations/:registrationId/checkin`

**Authentication:** Required (Bearer token, ADMIN_LOGISTICS only)

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "registrationId": string,
    "name": string,
    "hasAttended": true
  },
  "message": string
}
```

**Status Codes:**
- `200`: Manual check-in successful
- `400`: Registration already checked in or not approved for check-in
- `404`: Registration not found for the provided event
- `500`: Internal server error

---

## Error Responses

All endpoints return appropriate HTTP status codes:

- `400`: Bad request (validation error)
- `401`: Unauthorized (missing or invalid token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not found (event/registration ID doesn't exist)
- `409`: Conflict (already registered for event or at capacity)
- `500`: Internal server error
