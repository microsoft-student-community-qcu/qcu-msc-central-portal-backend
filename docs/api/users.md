# User Management API

## Overview
The User Management API handles user authentication, registration, and role management for the QCU MSC Central Portal. Users can have one of three roles: `ADMIN`, `MEMBER`, or `STUDENT`.

---

## Endpoints

### 1. Create User (Register)

**Description:**  
Creates a new user account in the system. Supports both admin creation and self-registration.

**Method:** `POST`  
**Path:** `/api/users`

**Request Parameters:**
- `name` (string, required): User's full name (1-100 characters)
- `email` (string, required): Valid email address (must be unique)
- `password` (string, required): Password (minimum 8 characters)
- `role` (enum, optional): User role - `ADMIN`, `MEMBER`, or `STUDENT`. Defaults to `STUDENT`

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "id": string (UUID),
    "email": string,
    "name": string,
    "role": "ADMIN" | "MEMBER" | "STUDENT",
    "emailVerified": boolean,
    "createdAt": string (ISO 8601 timestamp)
  },
  "message": string
}
```

**Example Request:**
```bash
curl -X POST http://localhost:5000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "SecurePass123",
    "role": "STUDENT"
  }'
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "john@example.com",
    "name": "John Doe",
    "role": "STUDENT",
    "emailVerified": false,
    "createdAt": "2026-06-15T10:30:00Z"
  },
  "message": "User created successfully"
}
```

---

### 2. Login User

**Description:**  
Authenticates a user and returns a JWT token for subsequent requests.

**Method:** `POST`  
**Path:** `/api/users/login`

**Request Parameters:**
- `email` (string, required): User's email address
- `password` (string, required): User's password

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "token": string (JWT),
    "user": {
      "id": string,
      "email": string,
      "name": string,
      "role": "ADMIN" | "MEMBER" | "STUDENT"
    }
  },
  "message": string
}
```

**Example Request:**
```bash
curl -X POST http://localhost:5000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123"
  }'
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "john@example.com",
      "name": "John Doe",
      "role": "STUDENT"
    }
  },
  "message": "Login successful"
}
```

---

### 3. Get User Profile

**Description:**  
Retrieves the authenticated user's profile information.

**Method:** `GET`  
**Path:** `/api/users/me`

**Authentication:** Required (Bearer token in Authorization header)

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "id": string,
    "email": string,
    "name": string,
    "role": "ADMIN" | "MEMBER" | "STUDENT",
    "emailVerified": boolean,
    "image": string | null,
    "createdAt": string (ISO 8601),
    "updatedAt": string (ISO 8601)
  },
  "message": string
}
```

**Example Request:**
```bash
curl -X GET http://localhost:5000/api/users/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "john@example.com",
    "name": "John Doe",
    "role": "STUDENT",
    "emailVerified": false,
    "image": null,
    "createdAt": "2026-06-15T10:30:00Z",
    "updatedAt": "2026-06-15T10:30:00Z"
  },
  "message": "User profile retrieved"
}
```

---

### 4. Update User Role (Admin Only)

**Description:**  
Updates a user's role. Only accessible to users with `ADMIN` role.

**Method:** `PATCH`  
**Path:** `/api/users/:userId/role`

**Authentication:** Required (Bearer token, must be ADMIN)

**Request Parameters:**
- `role` (enum, required): New role - `ADMIN`, `MEMBER`, or `STUDENT`

**Response Format:**
```json
{
  "success": boolean,
  "data": {
    "id": string,
    "email": string,
    "name": string,
    "role": "ADMIN" | "MEMBER" | "STUDENT",
    "updatedAt": string (ISO 8601)
  },
  "message": string
}
```

**Example Request:**
```bash
curl -X PATCH http://localhost:5000/api/users/550e8400-e29b-41d4-a716-446655440000/role \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "role": "MEMBER"
  }'
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "john@example.com",
    "name": "John Doe",
    "role": "MEMBER",
    "updatedAt": "2026-06-15T11:00:00Z"
  },
  "message": "User role updated successfully"
}
```

---

## Error Responses

All endpoints return appropriate HTTP status codes and error messages:

```json
{
  "success": false,
  "error": string,
  "details": object (optional)
}
```

**Common Status Codes:**
- `400`: Bad request (validation error)
- `401`: Unauthorized (missing or invalid token)
- `403`: Forbidden (insufficient permissions)
- `409`: Conflict (email already exists)
- `500`: Internal server error
