import { Hono } from "hono";
import { cleanupMemoryCache, rateLimitMiddleware } from "./middleware/ratelimit";
// import ocr from "./interface/ocr";

const app = new Hono();

app.use("*", rateLimitMiddleware);

app.get("/", (c) => {
  setInterval(cleanupMemoryCache, 60000);
  return c.json({ message: "hello" });
});
// app.get("/admin/rate-limit-stats", (c) => {
//   const ip = c.req.header("CF-Connecting-IP") || "unknown";
//   return c.json(getRateLimitStatus(c, ip));
// });
// app.route("/api/ocr", ocr);

export default app;
