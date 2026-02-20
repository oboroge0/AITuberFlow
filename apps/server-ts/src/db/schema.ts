import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workflows = sqliteTable("workflows", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  nodesJson: text("nodes_json").notNull().default("[]"),
  connectionsJson: text("connections_json").notNull().default("[]"),
  characterJson: text("character_json").default(
    '{"name": "AI Assistant", "personality": "Friendly and helpful"}',
  ),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const globalSettings = sqliteTable("global_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});
