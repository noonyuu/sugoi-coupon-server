import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, integer } from "drizzle-orm/pg-core";

const insertTodoSchema = pgTable("coupon", {
  store: text().notNull(),
  usagePeriodStart: text(),
  usagePeriodEnd: text(), 
  discount: integer().default(0),
  discountType: integer().default(0),
  imagePath: text(),
});

const couponSelectSchema = createInsertSchema(insertTodoSchema);

export { insertTodoSchema, couponSelectSchema };