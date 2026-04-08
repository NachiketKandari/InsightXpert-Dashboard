import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite-preview";
const GEMINI_THINKING_LEVEL = process.env.GEMINI_THINKING_LEVEL || "low";

/**
 * POST /api/gemini
 * Generic Gemini API proxy. Accepts { prompt, model?, thinking_level? } and returns the response.
 * Used for both SQL generation and schema linking prompts.
 */
export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 500 }
    );
  }

  try {
    const { prompt, model, thinking_level } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "prompt (string) is required" },
        { status: 400 }
      );
    }

    const useModel = model || GEMINI_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent?key=${GEMINI_API_KEY}`;

    // Build request body with thinking config support
    const genConfig: Record<string, unknown> = {
      temperature: 0,
      maxOutputTokens: 16384,
    };

    // Use request-level thinking_level, fall back to env var default
    const effectiveThinking = thinking_level || GEMINI_THINKING_LEVEL;
    if (effectiveThinking && effectiveThinking !== "none") {
      genConfig.thinkingConfig = {
        thinkingLevel: effectiveThinking,
      };
    }

    const body: Record<string, unknown> = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: genConfig,
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { error: `Gemini API error ${resp.status}: ${text}` },
        { status: 502 }
      );
    }

    const data = await resp.json();
    const candidate = data.candidates?.[0];

    // Separate thinking parts from text parts
    const parts: { text?: string; thought?: boolean }[] =
      candidate?.content?.parts ?? [];
    const thinkingParts = parts.filter((p) => p.thought).map((p) => p.text ?? "");
    const textParts = parts.filter((p) => !p.thought).map((p) => p.text ?? "");

    const text = textParts.join("");
    const thinking = thinkingParts.join("") || null;

    // Try to extract SQL from the response
    const sqlMatch = text.match(/```sql\s*([\s\S]*?)```/i);
    const sql = sqlMatch ? sqlMatch[1].trim() : null;

    return NextResponse.json({
      text,
      thinking,
      sql,
      model: useModel,
      usage: data.usageMetadata ?? null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
