import { Hono } from "hono";
import ocr from "./interface/ocr";

const app = new Hono();

app.get("/", (c) => {
  return c.json({ message: "hello" });
});

app.route("/api/ocr", ocr);

export default app;
