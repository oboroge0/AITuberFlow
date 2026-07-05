import { blob, index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const memories = sqliteTable(
  "memories",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id").notNull(),
    tableName: text("table_name").notNull(),
    content: text("content").notNull(),
    embedding: blob("embedding", { mode: "buffer" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    workflowTableIdx: index("memories_workflow_table_idx").on(table.workflowId, table.tableName),
  }),
);

/**
 * Registry of memory table names per workflow. Lets the node-config UI offer
 * a selector instead of free-text input (avoids typo-driven table splits),
 * while still allowing empty tables to exist before any memory is saved.
 */
export const memoryTables = sqliteTable(
  "memory_tables",
  {
    workflowId: text("workflow_id").notNull(),
    name: text("name").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    workflowNameIdx: uniqueIndex("memory_tables_workflow_name_idx").on(
      table.workflowId,
      table.name,
    ),
  }),
);
