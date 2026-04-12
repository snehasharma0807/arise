/**
 * @jest-environment node
 *
 * Tests for the text-to-speech Supabase Edge Function logic.
 *
 * Uses jest-environment-node so that Node 22's native Request/Response/Headers
 * are available (jsdom does not provide fetch Web API globals).
 *
 * Because the Edge Function runs in Deno with its own `serve()` / `Deno.env`,
 * we test the core logic by extracting it into a handler and simulating
 * Request/Response in a Node environment (which uses the same Web API shapes).
 */

// ── Inline the handler logic so we can test it in Node/Jest ─────────────────
// We replicate the handler function here rather than importing the Deno file
// (which uses `https://deno.land/...` imports that don't resolve in Node).

interface ElevenLabsVoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
}

interface TTSRequest {
  text: string;
  preset?: "explanation" | "followup";
  voiceId?: string;
}

const ARIA_VOICE_ID = "9BWtsMINqrJLrRacOk9x";
const ELEVENLABS_MODEL = "eleven_turbo_v2_5";

const VOICE_PRESETS: Record<"explanation" | "followup", ElevenLabsVoiceSettings> = {
  explanation: { stability: 0.80, similarity_boost: 0.85, style: 0.20, use_speaker_boost: true },
  followup:    { stability: 0.70, similarity_boost: 0.80, style: 0.25, use_speaker_boost: true },
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function handleTTSRequest(
  req: Request,
  env: { ELEVENLABS_API_KEY?: string; ELEVENLABS_VOICE_ID?: string },
  fetchFn: typeof fetch = fetch
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonError("Method not allowed", 405);

  let body: TTSRequest;
  try { body = await req.json(); }
  catch { return jsonError("Invalid JSON body", 400); }

  const { text, preset = "explanation", voiceId } = body;

  if (!text || typeof text !== "string" || text.trim().length === 0)
    return jsonError("`text` is required and must be a non-empty string", 400);
  if (text.length > 5000)
    return jsonError("`text` exceeds 5 000 character limit", 400);

  const apiKey = env.ELEVENLABS_API_KEY;
  if (!apiKey) return jsonError("TTS service not configured", 500);

  const resolvedVoiceId = voiceId ?? env.ELEVENLABS_VOICE_ID ?? ARIA_VOICE_ID;
  const voiceSettings = VOICE_PRESETS[preset] ?? VOICE_PRESETS.explanation;

  let elevenResponse: Response;
  try {
    elevenResponse = await fetchFn(
      `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}/stream`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text: text.trim(), model_id: ELEVENLABS_MODEL, voice_settings: voiceSettings }),
      }
    );
  } catch (err) {
    return jsonError("Could not reach TTS service", 502);
  }

  if (!elevenResponse.ok) return jsonError("TTS generation failed", elevenResponse.status);

  const meta = JSON.stringify({ voiceId: resolvedVoiceId, preset, charCount: text.trim().length, generatedAt: new Date().toISOString() });

  return new Response(elevenResponse.body, {
    headers: { ...CORS_HEADERS, "Content-Type": "audio/mpeg", "Cache-Control": "no-cache, no-store", "X-Arise-Meta": meta },
  });
}

// ── Test helpers ─────────────────────────────────────────────────────────────

const ENV = { ELEVENLABS_API_KEY: "sk_test_key" };

function makeAudioResponse() {
  return new Response(new Blob(["fake-mp3"], { type: "audio/mpeg" }), {
    status: 200,
    headers: { "Content-Type": "audio/mpeg" },
  });
}

function post(body: object) {
  return new Request("https://example.com/functions/v1/text-to-speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("text-to-speech Edge Function — CORS preflight", () => {
  it("responds 200 ok to OPTIONS", async () => {
    const req = new Request("https://x.co", { method: "OPTIONS" });
    const res = await handleTTSRequest(req, ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("text-to-speech Edge Function — method validation", () => {
  it("rejects GET with 405", async () => {
    const req = new Request("https://x.co", { method: "GET" });
    const res = await handleTTSRequest(req, ENV);
    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.error).toMatch(/Method not allowed/i);
  });
});

describe("text-to-speech Edge Function — request body validation", () => {
  it("rejects invalid JSON with 400", async () => {
    const req = new Request("https://x.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    });
    const res = await handleTTSRequest(req, ENV);
    expect(res.status).toBe(400);
  });

  it("rejects missing `text` with 400", async () => {
    const res = await handleTTSRequest(post({}), ENV);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/text/i);
  });

  it("rejects empty string `text` with 400", async () => {
    const res = await handleTTSRequest(post({ text: "   " }), ENV);
    expect(res.status).toBe(400);
  });

  it("rejects text over 5 000 chars with 400", async () => {
    const res = await handleTTSRequest(post({ text: "a".repeat(5001) }), ENV);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/5 000/);
  });
});

describe("text-to-speech Edge Function — missing API key", () => {
  it("returns 500 when ELEVENLABS_API_KEY is not set", async () => {
    const res = await handleTTSRequest(post({ text: "Hello" }), {});
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/not configured/i);
  });
});

describe("text-to-speech Edge Function — ElevenLabs call", () => {
  it("calls ElevenLabs with correct voice ID, model, and preset settings", async () => {
    const mockFetch = jest.fn().mockResolvedValue(makeAudioResponse());
    await handleTTSRequest(post({ text: "Take one tablet daily." }), ENV, mockFetch);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(ARIA_VOICE_ID);
    expect(url).toContain("/stream");

    const requestBody = JSON.parse(options.body as string);
    expect(requestBody.model_id).toBe(ELEVENLABS_MODEL);
    expect(requestBody.voice_settings.stability).toBe(0.80); // explanation preset
    expect(requestBody.text).toBe("Take one tablet daily.");
  });

  it("uses followup preset when specified", async () => {
    const mockFetch = jest.fn().mockResolvedValue(makeAudioResponse());
    await handleTTSRequest(post({ text: "Yes, that is safe.", preset: "followup" }), ENV, mockFetch);

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(requestBody.voice_settings.stability).toBe(0.70);
  });

  it("uses custom voiceId when provided", async () => {
    const mockFetch = jest.fn().mockResolvedValue(makeAudioResponse());
    await handleTTSRequest(post({ text: "Hello.", voiceId: "custom-voice-123" }), ENV, mockFetch);

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("custom-voice-123");
  });

  it("returns audio/mpeg with CORS headers on success", async () => {
    const mockFetch = jest.fn().mockResolvedValue(makeAudioResponse());
    const res = await handleTTSRequest(post({ text: "Take this pill." }), ENV, mockFetch);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("includes X-Arise-Meta header with voiceId, preset, charCount", async () => {
    const mockFetch = jest.fn().mockResolvedValue(makeAudioResponse());
    const res = await handleTTSRequest(post({ text: "Hello world." }), ENV, mockFetch);

    const meta = JSON.parse(res.headers.get("X-Arise-Meta")!);
    expect(meta.voiceId).toBe(ARIA_VOICE_ID);
    expect(meta.preset).toBe("explanation");
    expect(meta.charCount).toBe("Hello world.".length);
    expect(meta.generatedAt).toBeTruthy();
  });

  it("returns 502 when fetch to ElevenLabs throws a network error", async () => {
    const mockFetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const res = await handleTTSRequest(post({ text: "Hello." }), ENV, mockFetch);

    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/Could not reach/i);
  });

  it("forwards ElevenLabs non-200 status as the response status", async () => {
    const mockFetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "quota exceeded" }), { status: 429 })
    );
    const res = await handleTTSRequest(post({ text: "Hello." }), ENV, mockFetch);
    expect(res.status).toBe(429);
  });
});
