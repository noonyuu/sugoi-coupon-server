import { sql } from "drizzle-orm";
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const coupon = sqliteTable("todos", {
  id: integer("id").primaryKey().notNull(),
  store: text("store").notNull(),
  usagePeriodStart: text("usage_period_start"),
  usagePeriodEnd: text("usage_period_end"),
  discount: integer("discount").default(0),
  discountType: integer("discount_type").default(0),
  imagePath: text("image_path"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`)
    .$onUpdateFn(() => sql`(current_timestamp)`),
});
