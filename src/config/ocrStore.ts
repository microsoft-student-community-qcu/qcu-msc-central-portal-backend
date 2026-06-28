import { v4 as uuidv4 } from "uuid";

interface OcrSession {
  ocrSessionId: string;
  studentId: string | null;
  lastName: string | null;
  firstName: string | null;
  manualRequired: boolean;
  attemptsRemaining: number;
  imagePath: string | null;
  createdAt: number;
}

interface FailureEntry {
  count: number;
  firstAttempt: number;
}

const sessions = new Map<string, OcrSession>();
const failureCounters = new Map<string, FailureEntry>();

const SESSION_TTL = 10 * 60 * 1000;
const FAILURE_TTL = 60 * 60 * 1000;

function prune(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL) {
      sessions.delete(id);
    }
  }
  for (const [ip, entry] of failureCounters) {
    if (now - entry.firstAttempt > FAILURE_TTL) {
      failureCounters.delete(ip);
    }
  }
}

setInterval(prune, 60_000);

export const ocrStore = {
  getSession(sessionId: string): OcrSession | undefined {
    return sessions.get(sessionId);
  },

  createSession(data: {
    studentId: string | null;
    lastName: string | null;
    firstName: string | null;
    manualRequired: boolean;
    attemptsRemaining: number;
    imagePath: string | null;
  }): OcrSession {
    const session: OcrSession = {
      ocrSessionId: uuidv4(),
      ...data,
      createdAt: Date.now(),
    };
    sessions.set(session.ocrSessionId, session);
    return session;
  },

  getFailureCount(ip: string): number {
    return failureCounters.get(ip)?.count ?? 0;
  },

  incrementFailure(ip: string, maxFailures: number): number {
    const now = Date.now();
    const existing = failureCounters.get(ip);
    if (existing && now - existing.firstAttempt > FAILURE_TTL) {
      failureCounters.delete(ip);
    }
    const entry = failureCounters.get(ip) ?? { count: 0, firstAttempt: now };
    entry.count += 1;
    failureCounters.set(ip, entry);
    return Math.max(0, maxFailures - entry.count);
  },

  resetFailures(ip: string): void {
    failureCounters.delete(ip);
  },
};
