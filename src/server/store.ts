import "server-only";

import { and, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  authNonces,
  forecasts,
  questions,
  rooms,
  sessions,
  users,
} from "@/db/schema";
import type { QuestionStatus } from "@/lib/forecasting";
import { buildCommitmentTree } from "@/lib/merkle";

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

export type StoredRoom = {
  id: string;
  name: string;
  description: string;
  ownerUserId: string;
  createdAt: Date;
};

export type StoredQuestion = {
  id: string;
  roomId: string;
  prompt: string;
  category: string;
  resolutionCriteria: string;
  closesAt: Date;
  status: QuestionStatus;
  outcome: number | null;
  evidenceLabel: string | null;
  evidenceUrl: string | null;
  openedAt: Date | null;
  sealedAt: Date | null;
  commitmentsRoot: string | null;
  commitmentCount: number | null;
  resolvedAt: Date | null;
  createdAt: Date;
};

type MemoryState = {
  nonces: Map<string, AuthNonceRecord>;
  users: Map<string, { id: string; walletAddress: string }>;
  sessions: Map<string, SessionRecord>;
  forecasts: Map<string, StoredForecast>;
  rooms: Map<string, StoredRoom>;
  questions: Map<string, StoredQuestion>;
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
    rooms: new Map(),
    questions: new Map(),
  });

// Hot reload can preserve a store created by an older module version.
memory.rooms ??= new Map();
memory.questions ??= new Map();

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
    if (memory.forecasts.has(key)) return "duplicate" as const;
    const question = memory.questions.get(record.questionId);
    if (question && (question.status !== "open" || question.closesAt <= new Date())) {
      return "closed" as const;
    }
    memory.forecasts.set(key, record);
    return "created" as const;
  }

  return db.transaction(async (tx) => {
    const [question] = await tx
      .select({ status: questions.status, closesAt: questions.closesAt })
      .from(questions)
      .where(eq(questions.id, record.questionId))
      .for("update");
    if (question && (question.status !== "open" || question.closesAt <= new Date())) {
      return "closed" as const;
    }
    const created = await tx
      .insert(forecasts)
      .values(record)
      .onConflictDoNothing()
      .returning({ id: forecasts.id });
    return created.length === 1 ? "created" as const : "duplicate" as const;
  });
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

export async function listForecastsForQuestion(questionId: string) {
  const db = getDb();
  if (!db) {
    return Array.from(memory.forecasts.values()).filter(
      (forecast) => forecast.questionId === questionId,
    );
  }
  return db.select().from(forecasts).where(eq(forecasts.questionId, questionId));
}

export async function listRoomForecastsWithWallet(roomId: string) {
  const db = getDb();
  if (!db) {
    const addressesByUserId = new Map(
      Array.from(memory.users.values(), (user) => [user.id, user.walletAddress]),
    );
    return Array.from(memory.forecasts.values())
      .filter((forecast) => forecast.roomId === roomId)
      .flatMap((forecast) => {
        const walletAddress = addressesByUserId.get(forecast.userId);
        return walletAddress
          ? [{
              questionId: forecast.questionId,
              walletAddress,
              probabilityBps: forecast.probabilityBps,
            }]
          : [];
      });
  }

  return db
    .select({
      questionId: forecasts.questionId,
      walletAddress: users.walletAddress,
      probabilityBps: forecasts.probabilityBps,
    })
    .from(forecasts)
    .innerJoin(users, eq(forecasts.userId, users.id))
    .where(eq(forecasts.roomId, roomId));
}

export async function createRoom(record: StoredRoom) {
  const db = getDb();
  if (!db) {
    memory.rooms.set(record.id, record);
    return record;
  }
  const [created] = await db.insert(rooms).values(record).returning();
  return created as StoredRoom;
}

export async function getRoom(id: string) {
  const db = getDb();
  if (!db) return memory.rooms.get(id) ?? null;
  const [room] = await db.select().from(rooms).where(eq(rooms.id, id)).limit(1);
  return room ?? null;
}

export async function listRoomsByOwner(ownerUserId: string) {
  const db = getDb();
  if (!db) {
    return Array.from(memory.rooms.values())
      .filter((room) => room.ownerUserId === ownerUserId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select().from(rooms).where(eq(rooms.ownerUserId, ownerUserId));
}

export async function createQuestion(record: StoredQuestion) {
  const db = getDb();
  if (!db) {
    memory.questions.set(record.id, record);
    return record;
  }
  const [created] = await db.insert(questions).values(record).returning();
  return { ...created, status: created.status as QuestionStatus };
}

export async function getQuestion(id: string) {
  const db = getDb();
  if (!db) return memory.questions.get(id) ?? null;
  const [question] = await db
    .select()
    .from(questions)
    .where(eq(questions.id, id))
    .limit(1);
  return question
    ? { ...question, status: question.status as QuestionStatus }
    : null;
}

export async function getRoomQuestion(roomId: string, questionId: string) {
  const question = await getQuestion(questionId);
  return question?.roomId === roomId ? question : null;
}

export async function listQuestionsByRoom(roomId: string) {
  const db = getDb();
  if (!db) {
    return Array.from(memory.questions.values())
      .filter((question) => question.roomId === roomId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  const records = await db
    .select()
    .from(questions)
    .where(eq(questions.roomId, roomId));
  return records.map((question) => ({
    ...question,
    status: question.status as QuestionStatus,
  }));
}

export async function transitionQuestion(
  id: string,
  expectedStatus: QuestionStatus,
  values: Partial<
    Pick<
      StoredQuestion,
      | "status"
      | "outcome"
      | "evidenceLabel"
      | "evidenceUrl"
      | "openedAt"
      | "sealedAt"
      | "commitmentsRoot"
      | "commitmentCount"
      | "resolvedAt"
    >
  >,
) {
  const db = getDb();
  if (!db) {
    const question = memory.questions.get(id);
    if (!question || question.status !== expectedStatus) return null;
    const snapshot = values.status === "sealed"
      ? buildCommitmentTree(
          Array.from(memory.forecasts.values())
            .filter((forecast) => forecast.questionId === id)
            .map((forecast) => forecast.commitmentHash),
        )
      : null;
    const updated = {
      ...question,
      ...values,
      ...(snapshot ? { commitmentsRoot: snapshot.root, commitmentCount: snapshot.count } : {}),
    };
    memory.questions.set(id, updated);
    return updated;
  }

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: questions.status })
      .from(questions)
      .where(eq(questions.id, id))
      .for("update");
    if (!current || current.status !== expectedStatus) return null;
    const snapshot = values.status === "sealed"
      ? buildCommitmentTree(
          (await tx
            .select({ commitmentHash: forecasts.commitmentHash })
            .from(forecasts)
            .where(eq(forecasts.questionId, id)))
            .map((forecast) => forecast.commitmentHash),
        )
      : null;
    const [updated] = await tx
      .update(questions)
      .set({
        ...values,
        ...(snapshot ? { commitmentsRoot: snapshot.root, commitmentCount: snapshot.count } : {}),
      })
      .where(eq(questions.id, id))
      .returning();
    return updated ? { ...updated, status: updated.status as QuestionStatus } : null;
  });
}
