import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  walletAddress: text("wallet_address").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authNonces = pgTable("auth_nonces", {
  id: text("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  message: text("message").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rooms = pgTable("rooms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questions = pgTable("questions", {
  id: text("id").primaryKey(),
  roomId: text("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  category: text("category").notNull(),
  resolutionCriteria: text("resolution_criteria").notNull(),
  closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("draft"),
  outcome: integer("outcome"),
  evidenceLabel: text("evidence_label"),
  evidenceUrl: text("evidence_url"),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  sealedAt: timestamp("sealed_at", { withTimezone: true }),
  commitmentsRoot: text("commitments_root"),
  commitmentCount: integer("commitment_count"),
  resultsRoot: text("results_root"),
  evidenceHash: text("evidence_hash"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const forecasts = pgTable(
  "forecasts",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull(),
    questionId: text("question_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    probabilityBps: integer("probability_bps").notNull(),
    salt: text("salt").notNull(),
    commitmentHash: text("commitment_hash").notNull(),
    signature: text("signature").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("forecasts_question_user_unique").on(
      table.roomId,
      table.questionId,
      table.userId,
    ),
  ],
);
