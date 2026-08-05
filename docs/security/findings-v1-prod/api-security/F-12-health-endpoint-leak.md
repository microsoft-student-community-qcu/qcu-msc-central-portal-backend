# F-12 — `/health` Leaks Internal Error Details

- **Category:** API Security (information disclosure)
- **Affected file:** `src/app.ts:556-564`
- **Severity:** Low · **Exploitability:** Direct

---

## Summary

The public `/health` endpoint returns the raw database error message to the client on failure, which can reveal internal connection details (hostnames, credentials fragments, driver internals).

---

## Evidence

```ts
app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "healthy", database: "connected" });
  } catch (error: any) {
    captureDatabaseError(error, { endpoint: "/health", action: "SELECT 1" });
    res.status(500).json({ status: "unhealthy", database: "disconnected", error: error.message });
    //                                                                        ^^^^^^^^^^^^^^^^
  }
});
```

---

## Why it is vulnerable

`error.message` from Prisma/MySQL can embed the connection string host, port, database name, and sometimes username — useful reconnaissance for a subsequent attack. Sentry already captures the full error (`captureDatabaseError`), so the client copy adds nothing.

---

## Attack scenario

Attacker triggers or waits for a DB outage, calls `/health`, and reads the leaked connection metadata to target the database tier directly.

---

## Recommended fix

```ts
app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "healthy", database: "connected" });
  } catch (error) {
    captureDatabaseError(error, { endpoint: "/health", action: "SELECT 1" });
    res.status(500).json({ status: "unhealthy", database: "disconnected" });
  }
});
```
