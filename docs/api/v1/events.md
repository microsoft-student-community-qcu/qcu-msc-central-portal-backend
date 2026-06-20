# Event Management & Registration API

## Overview
The Event Management API handles creation, management, and registration for workshops, seminars, and initiatives. Supports both public and members-only events with capacity management.

---

## Endpoints

### 1. Create Event

**Description:**  
Creates a new workshop, seminar, or initiative event. Only ADMIN/MEMBER users can create events.

**Method:** `POST`  
**Path:** `/api/events`

**Authentication:** Required (Bearer token, ADMIN/MEMBER only)

**Request Parameters:**
- `title` (string, required): Event title (1-150 characters)
- `description` (string, optional): Event description (max 1000 characters)
- `date` (string, required): Event date in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ)
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
    "type": "PUBLIC" | "MEMBERS_ONLY",
    "maxCapacity": number,
    "createdAt": string (ISO 8601)
  },
  "message": string
}
```

**Example Request:**
```bash
curl -X POST http://localhost:5000/api/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "title": "Python Workshop 2026",
    "description": "Learn advanced Python programming techniques",
    "date": "2026-07-15T14:00:00Z",
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
**Path:** `/api/events/:eventId`

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
    "registeredCount": number,
    "createdAt": string (ISO 8601),
    "updatedAt": string (ISO 8601)
  },
  "message": string
}
```

**Example Request:**
```bash
curl -X GET http://localhost:5000/api/events/770e8400-e29b-41d4-a716-446655440002
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
    "type": "PUBLIC",
    "maxCapacity": 50,
    "registeredCount": 12,
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
**Path:** `/api/events`

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
curl -X GET "http://localhost:5000/api/events?type=PUBLIC&limit=20"
```

---

### 4. Update Event

**Description:**  
Updates event details. Only ADMIN/MEMBER users can update events.

**Method:** `PATCH`  
**Path:** `/api/events/:eventId`

**Authentication:** Required (Bearer token, ADMIN/MEMBER only)

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
curl -X PATCH http://localhost:5000/api/events/770e8400-e29b-41d4-a716-446655440002 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "maxCapacity": 75
  }'
```

---

### 5. Delete Event

**Description:**  
Deletes an event and all associated registrations. Only ADMIN users can delete events.

**Method:** `DELETE`  
**Path:** `/api/events/:eventId`

**Authentication:** Required (Bearer token, ADMIN only)

**Response Format:**
```json
{
  "success": boolean,
  "message": string
}
```

**Example Request:**
```bash
curl -X DELETE http://localhost:5000/api/events/770e8400-e29b-41d4-a716-446655440002 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Event Registration Endpoints

### 6. Register for Event

**Description:**  
Registers a student (member or non-member) for an event. Generates a unique QR code for event check-in.

**Method:** `POST`  
**Path:** `/api/events/:eventId/register`

**Request Parameters:**
- `name` (string, required): Attendee's name (1-100 characters)
- `email` (string, required): Attendee's email address
- `userId` (string, optional): User ID if registered member (UUID format)

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "registrationId": string,
    "eventId": string,
    "name": string,
    "email": string,
    "qrCode": string (QR payload UUID),
    "hasAttended": boolean,
    "createdAt": string (ISO 8601)
  },
  "message": string
}
```

**Example Request:**
```bash
curl -X POST http://localhost:5000/api/events/770e8400-e29b-41d4-a716-446655440002/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alex Johnson",
    "email": "alex@example.com",
    "userId": null
  }'
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "registrationId": "880e8400-e29b-41d4-a716-446655440003",
    "eventId": "770e8400-e29b-41d4-a716-446655440002",
    "name": "Alex Johnson",
    "email": "alex@example.com",
    "qrCode": "880e8400-e29b-41d4-a716-446655440003",
    "hasAttended": false,
    "createdAt": "2026-06-15T11:00:00Z"
  },
  "message": "Registration successful"
}
```

---

### 7. Get Event Registrations

**Description:**  
Retrieves all registrations for a specific event. Only ADMIN/MEMBER users can view.

**Method:** `GET`  
**Path:** `/api/events/:eventId/registrations`

**Authentication:** Required (Bearer token, ADMIN/MEMBER only)

**Query Parameters:**
- `hasAttended` (optional): Filter by attendance status (true/false)
- `limit` (optional): Number of records to return (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "total": number,
    "registrations": [
      {
        "registrationId": string,
        "name": string,
        "email": string,
        "hasAttended": boolean,
        "createdAt": string
      }
    ]
  },
  "message": string
}
```

---

### 8. Mark Attendance

**Description:**  
Marks a student as attended using their QR code payload.

**Method:** `POST`  
**Path:** `/api/events/:eventId/attendance/:qrCode`

**Authentication:** Required (Bearer token, ADMIN/MEMBER only)

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "registrationId": string,
    "hasAttended": true,
    "message": string
  }
}
```

**Example Request:**
```bash
curl -X POST http://localhost:5000/api/events/770e8400-e29b-41d4-a716-446655440002/attendance/880e8400-e29b-41d4-a716-446655440003 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Error Responses

All endpoints return appropriate HTTP status codes:

- `400`: Bad request (validation error)
- `401`: Unauthorized (missing or invalid token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not found (event/registration ID doesn't exist)
- `409`: Conflict (already registered for event or at capacity)
- `500`: Internal server error
