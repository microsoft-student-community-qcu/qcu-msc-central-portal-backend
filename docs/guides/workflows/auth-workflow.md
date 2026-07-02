# Workflow — User Authentication

## Registration (New User)

```
User visits portal
	↓
User clicks "Register"
	↓
User enters: student_id, name, email, password
	↓
System validates input (Zod schema: createUserSchema)
	↓
Email already exists? → Error: "Email already registered"
	↓
Create User record in database (role defaults to APPLICANT)
	↓
Send verification email (managed by Better Auth)
	↓
User receives confirmation email
	↓
User clicks verification link
	↓
emailVerified set to true
	↓
Account activated ✓
```

**Key Decision Points:**
- Role assignment: Defaults to APPLICANT (admin assigns to ADMIN_HR or ADMIN_LOGISTICS via admin panel)
- Email verification: Required before full access

---

## Login

```
User visits login page
	↓
User enters email and password
	↓
System validates input (Zod schema: loginUserSchema)
	↓
Query User by email
	↓
User not found? → Error: "Invalid credentials"
	↓
Compare passwords (Better Auth handles hashing)
	↓
Password incorrect? → Error: "Invalid credentials"
	↓
Create Session record
	↓
Generate JWT token
	↓
Return token to client
	↓
Client stores token (localStorage/sessionStorage)
	↓
User authenticated ✓
```

**Key Decision Points:**
- Authentication type: JWT token-based
- Session persistence: Token expires after 7 days (JWT_EXPIRES_IN)
- User role determines accessible endpoints
