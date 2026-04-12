/**
 * @jest-environment node
 *
 * Tests for the format-safety-speech Supabase Edge Function logic.
 * Uses jest-environment-node so Node 22 fetch globals (Request/Response) are available.
 */

// ── Inline handler (same pattern as text-to-speech tests) ────────────────────

type RiskLevel = "safe" | "caution" | "dangerous";

interface FormatRequest {
  risk_level: RiskLevel;
  explanation: string;
  recommendation: string;
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

function buildPrompt(
  risk_level: RiskLevel,
  explanation: string,
  recommendation: string
): string {
  return `You are preparing a spoken warning for a medication interaction.
Risk level: ${risk_level}
Explanation: ${explanation}
Recommendation: ${recommendation}
Rewrite into a spoken message.
Rules:
- If "dangerous": clear and urgent, but calm (not scary)
- If "caution": gentle and careful
- max 2 sentences
- very simple language
Return ONLY the final spoken message.`;
}

async function handleFormatRequest(
  req: Request,
  env: { ANTHROPIC_API_KEY?: string; CLAUDE_MODEL?: string },
  fetchFn: typeof fetch = fetch
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonError("Method not allowed", 405);

  let body: FormatRequest;
  try { body = await req.json(); }
  catch { return jsonError("Invalid JSON body", 400); }

  const { risk_level, explanation, recommendation } = body;

  if (!risk_level || !["safe", "caution", "dangerous"].includes(risk_level))
    return jsonError('`risk_level` must be "safe", "caution", or "dangerous"', 400);
  if (!explanation?.trim())
    return jsonError("`explanation` is required", 400);
  if (!recommendation?.trim())
    return jsonError("`recommendation` is required", 400);

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return jsonError("Speech formatting service not configured", 500);

  const model = env.CLAUDE_MODEL ?? "claude-sonnet-4-6";

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
        max_tokens: 120,
        messages: [{ role: "user", content: buildPrompt(risk_level, explanation.trim(), recommendation.trim()) }],
      }),
    });
  } catch {
    return jsonError("Could not reach formatting service", 502);
  }

  if (!claudeResponse.ok) return jsonError("Speech formatting failed", claudeResponse.status);

  let formatted_text: string;
  try {
    const claudeBody = await claudeResponse.json();
    formatted_text = claudeBody?.content?.[0]?.text?.trim() ?? "";
    if (!formatted_text) throw new Error("Empty response");
  } catch {
    return jsonError("Failed to parse formatted speech", 500);
  }

  return new Response(JSON.stringify({ formatted_text }), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
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

const VALID_BODY = {
  risk_level: "caution" as RiskLevel,
  explanation: "Ibuprofen can raise blood pressure.",
  recommendation: "Use paracetamol instead.",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("format-safety-speech — CORS preflight", () => {
  it("responds 200 ok to OPTIONS", async () => {
    const res = await handleFormatRequest(
      new Request("https://x.co", { method: "OPTIONS" }),
      ENV
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("format-safety-speech — method validation", () => {
  it("rejects GET with 405", async () => {
    const res = await handleFormatRequest(
      new Request("https://x.co", { method: "GET" }),
      ENV
    );
    expect(res.status).toBe(405);
  });
});

describe("format-safety-speech — request validation", () => {
  it("rejects invalid JSON with 400", async () => {
    const req = new Request("https://x.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not{json",
    });
    const res = await handleFormatRequest(req, ENV);
    expect(res.status).toBe(400);
  });

  it.each(["unknown", "", null, undefined])(
    "rejects invalid risk_level '%s' with 400",
    async (level) => {
      const res = await handleFormatRequest(
        post({ ...VALID_BODY, risk_level: level }),
        ENV
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/risk_level/i);
    }
  );

  it("rejects missing explanation with 400", async () => {
    const res = await handleFormatRequest(
      post({ risk_level: "caution", explanation: "", recommendation: "Use X." }),
      ENV
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/explanation/i);
  });

  it("rejects missing recommendation with 400", async () => {
    const res = await handleFormatRequest(
      post({ risk_level: "caution", explanation: "Drug A interacts.", recommendation: "  " }),
      ENV
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/recommendation/i);
  });

  it("accepts all three valid risk levels", async () => {
    const levels: RiskLevel[] = ["safe", "caution", "dangerous"];
    for (const level of levels) {
      const mockFetch = jest.fn().mockResolvedValue(
        makeClaudeResponse("This is a spoken message.")
      );
      const res = await handleFormatRequest(
        post({ risk_level: level, explanation: "Some drug.", recommendation: "Do X." }),
        ENV,
        mockFetch
      );
      expect(res.status).toBe(200);
    }
  });
});

describe("format-safety-speech — missing API key", () => {
  it("returns 500 when ANTHROPIC_API_KEY is not set", async () => {
    const res = await handleFormatRequest(post(VALID_BODY), {});
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/not configured/i);
  });
});

describe("format-safety-speech — Claude API call", () => {
  it("calls the Anthropic messages endpoint with correct headers", async () => {
    const mockFetch = jest.fn().mockResolvedValue(
      makeClaudeResponse("Please be careful with this medicine.")
    );
    await handleFormatRequest(post(VALID_BODY), ENV, mockFetch);

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = opts.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("sends the correct model and max_tokens", async () => {
    const mockFetch = jest.fn().mockResolvedValue(
      makeClaudeResponse("Take care.")
    );
    await handleFormatRequest(post(VALID_BODY), ENV, mockFetch);

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(requestBody.model).toBe("claude-sonnet-4-6");
    expect(requestBody.max_tokens).toBe(120);
  });

  it("uses custom CLAUDE_MODEL when set", async () => {
    const mockFetch = jest.fn().mockResolvedValue(
      makeClaudeResponse("Take care.")
    );
    await handleFormatRequest(
      post(VALID_BODY),
      { ...ENV, CLAUDE_MODEL: "claude-haiku-4-5-20251001" },
      mockFetch
    );

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(requestBody.model).toBe("claude-haiku-4-5-20251001");
  });

  it("includes risk_level, explanation, and recommendation in the prompt", async () => {
    const mockFetch = jest.fn().mockResolvedValue(
      makeClaudeResponse("Avoid ibuprofen. Use paracetamol instead.")
    );
    await handleFormatRequest(
      post({
        risk_level: "dangerous",
        explanation: "This combination can cause kidney failure.",
        recommendation: "Stop immediately and call your doctor.",
      }),
      ENV,
      mockFetch
    );

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    const prompt: string = requestBody.messages[0].content;
    expect(prompt).toContain("dangerous");
    expect(prompt).toContain("This combination can cause kidney failure.");
    expect(prompt).toContain("Stop immediately and call your doctor.");
  });

  it("trims whitespace from explanation and recommendation before sending", async () => {
    const mockFetch = jest.fn().mockResolvedValue(makeClaudeResponse("Ok."));
    await handleFormatRequest(
      post({ risk_level: "safe", explanation: "  All good.  ", recommendation: "  Continue as normal.  " }),
      ENV,
      mockFetch
    );

    const prompt: string = JSON.parse(
      mockFetch.mock.calls[0][1].body as string
    ).messages[0].content;
    expect(prompt).toContain("All good.");
    expect(prompt).not.toContain("  All good.  ");
  });
});

describe("format-safety-speech — success response", () => {
  it("returns { formatted_text } from Claude's content", async () => {
    const mockFetch = jest.fn().mockResolvedValue(
      makeClaudeResponse("  Please avoid taking ibuprofen with this medication.  ")
    );
    const res = await handleFormatRequest(post(VALID_BODY), ENV, mockFetch);

    expect(res.status).toBe(200);
    const body = await res.json();
    // Should be trimmed
    expect(body.formatted_text).toBe(
      "Please avoid taking ibuprofen with this medication."
    );
  });

  it("includes CORS header on success", async () => {
    const mockFetch = jest.fn().mockResolvedValue(makeClaudeResponse("Safe."));
    const res = await handleFormatRequest(post(VALID_BODY), ENV, mockFetch);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("format-safety-speech — error handling", () => {
  it("returns 502 on network error to Claude", async () => {
    const mockFetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const res = await handleFormatRequest(post(VALID_BODY), ENV, mockFetch);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/Could not reach/i);
  });

  it("forwards Claude non-200 status", async () => {
    const mockFetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "overloaded" }), { status: 529 })
    );
    const res = await handleFormatRequest(post(VALID_BODY), ENV, mockFetch);
    expect(res.status).toBe(529);
  });

  it("returns 500 when Claude returns empty content", async () => {
    const mockFetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: "text", text: "" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const res = await handleFormatRequest(post(VALID_BODY), ENV, mockFetch);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/parse/i);
  });
});
