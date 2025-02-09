import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { Buffer } from "buffer";
import { Hono } from "hono";

const app = new Hono();

// ルートパス
app.post("/", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.picture as File;

    console.log(body["picture"]);

    if (!file) {
      return c.json({ error: "画像が送信されていません。" }, 400);
    }

    const question = "この画像からクーポンの利用期間と何円or何割引きかを取得してください\nもし見つけられなければ文字型にはnot found、数値型には0を入れてください";

    const buffer = await file.arrayBuffer();
    const base64Image = Buffer.from(buffer).toString("base64");

    // 画像データを準備
    const image = {
      inlineData: {
        data: base64Image,
        mimeType: file.type,
      },
    };

    const schema = {
      description: "List of recipes",
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          store: {
            type: SchemaType.STRING,
            description: "Name of the store",
            nullable: false,
          },
          usagePeriodStart: {
            type: SchemaType.STRING,
            description: "Usage period (start)",
            nullable: false,
          },
          usagePeriodEnd: {
            type: SchemaType.STRING,
            description: "Usage period (end)",
            nullable: false,
          },
          discount: {
            type: SchemaType.NUMBER,
            description: "the discount amount",
            nullable: false,
          },
          discountType: {
            type: SchemaType.NUMBER,
            description: "1(円)or2(割引き)or3(無料)or4(その他)",
            nullable: false,
          },
        },
        required: ["store", "usagePeriodStart", "usagePeriodEnd", "discount", "discountType"],
      },
    };
    
    // Gemini APIの呼び出し
    const genAI = new GoogleGenerativeAI((c.env as { GEMINI_API_KEY: string }).GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });
    const result = await model.generateContent([question, image]);
    const response = result.response;

    return c.json({ answer: response.text() });
  } catch (error) {
    console.error(error);
    return c.json({ error: "エラーが発生しました" }, 500);
  }
});

export default app;
