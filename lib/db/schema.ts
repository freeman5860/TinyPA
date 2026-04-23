import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  date,
  uuid,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  timezone: text("timezone").notNull().default("Asia/Shanghai"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  })
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  })
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rawText: text("raw_text").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCreatedIdx: index("messages_user_created_idx").on(t.userId, t.createdAt),
  })
);

export const itemTypeEnum = ["todo", "note", "mood", "followup"] as const;
export type ItemType = (typeof itemTypeEnum)[number];

export const itemStatusEnum = ["open", "done", "dropped"] as const;
export type ItemStatus = (typeof itemStatusEnum)[number];

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    type: text("type", { enum: itemTypeEnum }).notNull(),
    content: text("content").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    priority: integer("priority").notNull().default(2),
    status: text("status", { enum: itemStatusEnum }).notNull().default("open"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    userTypeStatusIdx: index("items_user_type_status_idx").on(t.userId, t.type, t.status),
    userDueIdx: index("items_user_due_idx").on(t.userId, t.dueAt),
  })
);

export const digests = pgTable(
  "digests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    summaryMd: text("summary_md").notNull(),
    topTodoIds: jsonb("top_todo_ids").$type<string[]>().notNull().default([]),
    morningSentAt: timestamp("morning_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userDateIdx: index("digests_user_date_idx").on(t.userId, t.date),
  })
);

export const pushSubs = pgTable("push_subs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  channel: text("channel", { enum: ["webpush", "email", "telegram"] as const }).notNull(),
  endpoint: jsonb("endpoint").$type<Record<string, unknown>>().notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  messages: many(messages),
  items: many(items),
  digests: many(digests),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  user: one(users, { fields: [messages.userId], references: [users.id] }),
  items: many(items),
}));

export const itemsRelations = relations(items, ({ one }) => ({
  user: one(users, { fields: [items.userId], references: [users.id] }),
  message: one(messages, { fields: [items.messageId], references: [messages.id] }),
}));
