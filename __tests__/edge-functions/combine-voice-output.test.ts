/**
 * @jest-environment node
 *
 * Tests for the combine-voice-output Supabase Edge Function logic.
 */

// ── Inline handler ─────────────────────────────────────────────────────────────

interface CombineRequest {
  explanation: string;
  risk_message?: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function buildCombinePrompt(explanation: string, risk_message: string): string {
  return `You are generating a final voice message for a user.
Explanation: ${explanation}
Risk message: ${risk_message}
Combine into a single natural spoken response.
Rules:
- flow naturally
- max 3 sentences total
- simple and warm tone
Return ONLY the final text.`;
}

function buildExplanationOnlyPrompt(explanation: string): string {
  return `You are preparing a spoken message for a patient about their medication.
Explanation: ${explanation}
Rewrite as a single natural spoken response.
Rules:
- warm and reassuring tone
- max 2 sentences
- very simple language
Return ONLY the final text.`;
}

async function handleCombineRequest(
  req: Request,
  env: { ANTHROPIC_API_KEY?: string; CLAUDE_MODEL?: string },
  fetchFn: typeof fetch = fetch
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonError("Method not allowed", 405);

  let body: CombineRequest;
  try { body = await req.json(); }
  catch { return jsonError("Invalid JSON body", 400); }

  const { explanation, risk_message } = body;

  if (!explanation?.trim()) return jsonError("`explanation` is required", 400);

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return jsonError("Voice combination service not configured", 500);

  const model = env.CLAUDE_MODEL ?? "claude-sonnet-4-6";
  const hasRiskMessage = Boolean(risk_message?.trim());
  const prompt = hasRiskMessage
    ? buildCombinePrompt(explanation.trim(), risk_message!.trim())
    : buildExplanationOnlyPrompt(explanation.trim());

  let claudeResponse: Response;
  try {
    claudeResponse = await fetchFn("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 180,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch {
    return jsonError("Could not reach voice combination service", 502);
  }

  if (!claudeResponse.ok) return jsonError("Voice combination failed", claudeResponse.status);

  let final_text: string;
  try {
    const b = await claudeResponse.json();
    final_text = b?.content?.[0]?.text?.trim() ?? "";
    if (!final_text) throw new Error("Empty response");
  } catch {
    return jsonError("Failed to parse combined voice output", 500);
  }

  return new Response(
    JSON.stringify({ final_text, explanation_only: !hasRiskMessage }),
    { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ENV = { ANTHROPIC_API_KEY: "sk-ant-test-key" };

function makeClaudeResponse(text: string) {
  return new Response(
    JSON.stringify({ content: [{ type: "text", text }] }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function post(body: object) {
  return new Request("https://x.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── CORS ──────────────────────────────────────────────────────────────────────

describe("combine-voice-output — CORS preflight", () => {
  it("responds 200 ok to OPTIONS with CORS headers", async () => {
    const res = await handleCombineRequest(
      new Request("https://x.co", { method: "OPTIONS" }),
      ENV
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

// ── Method validation ─────────────────────────────────────────────────────────

describe("combine-voice-output — method validation", () => {
  it("rejects GET with 405", async () => {
    const res = await handleCombineRequest(
      new Request("https://x.co", { method: "GET" }),
      ENV
    );
    expect(res.status).toBe(405);
  });
});

// ── Request validation ────────────────────────────────────────────────────────

describe("combine-voice-output — request validation", () => {
  it("rejects invalid JSON with 400", async () => {
    const res = await handleCombineRequest(
      new Request("https://x.co", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{{not-json",
      }),
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("rejects missing explanation with 400", async () => {
    const res = await handleCombineRequest(post({ risk_message: "Warning." }), ENV);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/explanation/i);
  });

  it("rejects empty explanation with 400", async () => {
    const res = await handleCombineRequest(post({ explanation: "   " }), ENV);
    expect(res.status).toBe(400);
  });

  it("accepts explanation without risk_message (safe interaction)", async () => {
    const mockFetch = jest.fn().mockResolvedValue(
      makeClaudeResponse("This medicine helps lower your blood pressure.")
    );
    const res = await handleCombineRequest(
      post({ explanation: "This medicine helps lower your blood pressure." }),
      ENV,
      mockFetch
    );
    expect(res.status).toBe(200);
  });
});

// ── Missing API key ───────────────────────────────────────────────────────────

describe("combine-voice-output — missing API key", () => {
  it("returns 500 when ANTHROPIC_API_KEY is not set", async () => {
    const res = await handleCombineRequest(post({ explanation: "Take daily." }), {});
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/not configured/i);
  });
});

// ── Prompt selection ──────────────────────────────────────────────────────────

describe("combine-voice-output — prompt selection", () => {
  it("uses combine prompt when risk_message is present", async () => {
    const mockFetch = jest.fn().mockResolvedValue(makeClaudeResponse("Combined."));
    await handleCombineRequest(
      post({
        explanation: "This pill lowers blood pressure.",
        risk_message: "Avoid ibuprofen.",
      }),
      ENV,
      mockFetch
    );

    const prompt: string = JSON.parse(
      mockFetch.mock.calls[0][1].body as string
    ).messages[0].content;
    expect(prompt).toContain("Risk message:");
    expect(prompt).toContain("Avoid ibuprofen.");
    expect(prompt).toContain("max 3 sentences total");
  });

  it("uses explanation-only prompt when risk_message is absent", async () => {
    const mockFetch = jest.fn().mockResolvedValue(makeClaudeResponse("Great."));
    await handleCombineRequest(
      post({ explanation: "This pill lowers blood pressure." }),
      ENV,
      mockFetch
    );

    const prompt: string = JSON.parse(
      mockFetch.mock.calls[0][1].body as string
    ).messages[0].content;
    expect(prompt).not.toContain("Risk message:");
    expect(prompt).toContain("warm and reassuring tone");
  });

  it("uses explanation-only prompt when risk_message is empty string", async () => {
    const mockFetch = jest.fn().mockResolvedValue(makeClaudeResponse("Ok."));
    await handleCombineRequest(
      post({ explanation: "Take one pill daily.", risk_message: "" }),
      ENV,
      mockFetch
    );

    const prompt: string = JSON.parse(
      mockFetch.mock.calls[0][1].body as string
    ).messages[0].content;
    expect(prompt).not.toContain("Risk message:");
  });

  it("uses explanation-only prompt when risk_message is whitespace-only", async () => {
    const mockFetch = jest.fn().mockResolvedValue(makeClaudeResponse("Ok."));
    await handleCombineRequest(
      post({ explanation: "Take one pill daily.", risk_message: "   " }),
      ENV,
      mockFetch
    );

    const prompt: string = JSON.parse(
      mockFetch.mock.calls[0][1].body as string
    ).messages[0].content;
    expect(prompt).not.toContain("Risk message:");
  });
});

// ── Claude API call ───────────────────────────────────────────────────────────

describe("combine-voice-output — Claude API call", () => {
  it("sends correct model and max_tokens (180)", async () => {
    const mockFetch = jest.fn().mockResolvedValue(makeClaudeResponse("Result."));
    await handleCombineRequest(
      post({ explanation: "Take daily.", risk_message: "Avoid X." }),
      ENV,
      mockFetch
    );

    const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(reqBody.model).toBe("claude-sonnet-4-6");
    expect(reqBody.max_tokens).toBe(180);
  });

  it("uses custom CLAUDE_MODEL when set", async () => {
    const mockFetch = jest.fn().mockResolvedValue(makeClaudeResponse("Result."));
    await handleCombineRequest(
      post({ explanation: "Take daily." }),
      { ...ENV, CLAUDE_MODEL: "claude-haiku-4-5-20251001" },
      mockFetch
    );

    const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(reqBody.model).toBe("claude-haiku-4-5-20251001");
  });

  it("trims whitespace from inputs before sending to Claude", async () => {
    const mockFetch = jest.fn().mockResolvedValue(makeClaudeResponse("Ok."));
    await handleCombineRequest(
      post({ explanation: "  Take daily.  ", risk_message: "  Avoid X.  " }),
      ENV,
      mockFetch
    );

    const prompt: string = JSON.parse(
      mockFetch.mock.calls[0][1].body as string
    ).messages[0].content;
    expect(prompt).toContain("Take daily.");
    expect(prompt).not.toContain("  Take daily.  ");
  });
});

// ── Success response ──────────────────────────────────────────────────────────

describe("combine-voice-output — success response", () => {
  it("returns trimmed final_text from Claude", async () => {
    const mockFetch = jest.fn().mockResolvedValue(
      makeClaudeResponse("  This is your blood pressure medicine. Please avoid ibuprofen.  ")
    );
    const res = await handleCombineRequest(
      post({ explanation: "Blood pressure.", risk_message: "No ibuprofen." }),
      ENV,
      mockFetch
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.final_text).toBe(
      "This is your blood pressure medicine. Please avoid ibuprofen."
    );
  });

  it("returns explanation_only=false when risk_message was present", async () => {
    const mockFetch = jest.fn().mockResolvedValue(makeClaudeResponse("Combined."));
    const res = await handleCombineRequest(
      post({ explanation: "Take daily.", risk_message: "Avoid X." }),
      ENV,
      mockFetch
    );
    expect((await res.json()).explanation_only).toBe(false);
  });

  it("returns explanation_only=true when risk_message was absent", async () => {
    const mockFetch = jest.fn().mockResolvedValue(makeClaudeResponse("Safe."));
    const res = await handleCombineRequest(
      post({ explanation: "Take daily." }),
      ENV,
      mockFetch
    );
    expect((await res.json()).explanation_only).toBe(true);
  });

  it("includes CORS header on success", async () => {
    const mockFetch = jest.fn().mockResolvedValue(makeClaudeResponse("Done."));
    const res = await handleCombineRequest(post({ explanation: "Take daily." }), ENV, mockFetch);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe("combine-voice-output — error handling", () => {
  it("returns 502 on network error to Claude", async () => {
    const mockFetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const res = await handleCombineRequest(
      post({ explanation: "Take daily." }),
      ENV,
      mockFetch
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/Could not reach/i);
  });

  it("forwards Claude non-200 status", async () => {
    const mockFetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "overloaded" }), { status: 529 })
    );
    const res = await handleCombineRequest(post({ explanation: "Take daily." }), ENV, mockFetch);
    expect(res.status).toBe(529);
  });

  it("returns 500 when Claude returns empty content", async () => {
    const mockFetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ content: [{ type: "text", text: "" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const res = await handleCombineRequest(post({ explanation: "Take daily." }), ENV, mockFetch);
    expect(res.status).toBe(500);
  });
});
