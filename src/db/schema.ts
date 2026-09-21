import {
  pgTable,
  varchar,
  uuid,
  timestamp,
  text,
  pgEnum,
  unique,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar({ length: 255 }).notNull(),
  email: varchar({ length: 255 }).notNull().unique(),
  password: varchar({ length: 255 }).notNull(),
  create_at: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar({ length: 255 }).notNull().unique(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  hash: varchar({ length: 512 }).unique().notNull(),
  createAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  tenantId: uuid("tenantId")
    .references(() => tenants.id, {
      onDelete: "cascade",
    })
    .notNull(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("userId").references(() => users.id), // no deletion
  title: varchar({ length: 255 }).notNull(),
  description: text("description"),
  createAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  tenantId: uuid("tenantId")
    .references(() => tenants.id, {
      onDelete: "cascade",
    })
    .notNull(),
});

export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "admin",
  "member",
]);
export const membership = pgTable(
  "membership",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("userId")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    tenantId: uuid("tenantId")
      .references(() => tenants.id, {
        onDelete: "cascade",
      })
      .notNull(),
    role: membershipRoleEnum("role").notNull().default("member"),
    createAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("membership_user_tenant_unique").on(table.userId, table.tenantId),
  ],
);
