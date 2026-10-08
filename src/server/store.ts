import "server-only";

import { and, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { authNonces, forecasts, sessions, users } from "@/db/schema";

export type AuthNonceRecord = {
  id: string;
  walletAddress: string;
  message: string;
  expiresAt: Date;
  consumedAt: Date | null;
};

export type SessionRecord = {
  id: string;
  userId: string;
  walletAddress: string;
  tokenHash: string;
  expiresAt: Date;
};

export type StoredForecast = {
  id: string;
  roomId: string;
  questionId: string;
  userId: string;
  probabilityBps: number;
  salt: string;
  commitmentHash: string;
  signature: string;
  submittedAt: Date;
};

type MemoryState = {
  nonces: Map<string, AuthNonceRecord>;
  users: Map<string, { id: string; walletAddress: string }>;
  sessions: Map<string, SessionRecord>;
  forecasts: Map<string, StoredForecast>;
};

declare global {
  var signalRoomMemory: MemoryState | undefined;
  var signalRoomSql: ReturnType<typeof postgres> | undefined;
}

const memory =
  globalThis.signalRoomMemory ??
  (globalThis.signalRoomMemory = {
    nonces: new Map(),
    users: new Map(),
    sessions: new Map(),
    forecasts: new Map(),
  });

function getDb() {
  if (!process.env.DATABASE_URL) return null;

  const sql =
    globalThis.signalRoomSql ??
    (globalThis.signalRoomSql = postgres(process.env.DATABASE_URL, {
      prepare: false,
      max: 5,
    }));

  return drizzle(sql);
}

export function storageMode() {
  return process.env.DATABASE_URL ? "postgres" : "memory";
}

export async function createNonce(record: AuthNonceRecord) {
  const db = getDb();
  if (!db) {
    memory.nonces.set(record.id, record);
    return;
  }

  await db.insert(authNonces).values(record);
}

export async function getNonce(id: string) {
  const db = getDb();
  if (!db) return memory.nonces.get(id) ?? null;

  const [record] = await db
    .select()
    .from(authNonces)
    .where(eq(authNonces.id, id))
    .limit(1);
  return record ?? null;
}

export async function consumeNonce(id: string) {
  const now = new Date();
  const db = getDb();

  if (!db) {
    const record = memory.nonces.get(id);
    if (!record || record.consumedAt || record.expiresAt <= now) return false;
    memory.nonces.set(id, { ...record, consumedAt: now });
    return true;
  }

  const consumed = await db
    .update(authNonces)
    .set({ consumedAt: now })
    .where(
      and(
        eq(authNonces.id, id),
        isNull(authNonces.consumedAt),
        gt(authNonces.expiresAt, now),
      ),
    )
    .returning({ id: authNonces.id });

  return consumed.length === 1;
}

export async function upsertUser(walletAddress: string) {
  const db = getDb();
  if (!db) {
    const existing = memory.users.get(walletAddress);
    if (existing) return existing;
    const user = { id: crypto.randomUUID(), walletAddress };
    memory.users.set(walletAddress, user);
    return user;
  }

  const id = crypto.randomUUID();
  await db
    .insert(users)
    .values({ id, walletAddress })
    .onConflictDoNothing({ target: users.walletAddress });

  const [user] = await db
    .select({ id: users.id, walletAddress: users.walletAddress })
    .from(users)
    .where(eq(users.walletAddress, walletAddress))
    .limit(1);

  if (!user) throw new Error("Unable to create wallet user");
  return user;
}

export async function createSession(record: SessionRecord) {
  const db = getDb();
  if (!db) {
    memory.sessions.set(record.tokenHash, record);
    return;
  }

  await db.insert(sessions).values({
    id: record.id,
    userId: record.userId,
    tokenHash: record.tokenHash,
    expiresAt: record.expiresAt,
  });
}

export async function getSession(tokenHash: string) {
  const now = new Date();
  const db = getDb();
  if (!db) {
    const session = memory.sessions.get(tokenHash);
    return session && session.expiresAt > now ? session : null;
  }

  const [record] = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      walletAddress: users.walletAddress,
      tokenHash: sessions.tokenHash,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);

  return record ?? null;
}

export async function deleteSession(tokenHash: string) {
  const db = getDb();
  if (!db) {
    memory.sessions.delete(tokenHash);
    return;
  }
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export async function createForecast(record: StoredForecast) {
  const key = `${record.roomId}:${record.questionId}:${record.userId}`;
  const db = getDb();

  if (!db) {
    if (memory.forecasts.has(key)) return false;
    memory.forecasts.set(key, record);
    return true;
  }

  const created = await db
    .insert(forecasts)
    .values(record)
    .onConflictDoNothing()
    .returning({ id: forecasts.id });
  return created.length === 1;
}

export async function getForecast(
  roomId: string,
  questionId: string,
  userId: string,
) {
  const key = `${roomId}:${questionId}:${userId}`;
  const db = getDb();
  if (!db) return memory.forecasts.get(key) ?? null;

  const [record] = await db
    .select()
    .from(forecasts)
    .where(
      and(
        eq(forecasts.roomId, roomId),
        eq(forecasts.questionId, questionId),
        eq(forecasts.userId, userId),
      ),
    )
    .limit(1);
  return record ?? null;
}
