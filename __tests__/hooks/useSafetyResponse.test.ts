import { renderHook, act, waitFor } from "@testing-library/react";
import { useSafetyResponse } from "@/hooks/useSafetyResponse";
import { mockFetchAudioSuccess, getLastAudioInstance } from "@/jest.setup";

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_OPTIONS = {
  riskLevel: "caution" as const,
  explanation: "Ibuprofen can raise blood pressure with this medication.",
  recommendation: "Use paracetamol instead of ibuprofen.",
};

/** Makes fetch return a successful format response followed by a TTS audio response. */
function mockFormatThenAudio(formattedText = "Please avoid ibuprofen with this medicine.") {
  // 1st fetch → format-safety-speech Edge Function
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: jest.fn().mockResolvedValue({ formatted_text: formattedText }),
    text: jest.fn().mockResolvedValue(JSON.stringify({ formatted_text: formattedText })),
  });

  // 2nd fetch → text-to-speech Edge Function
  mockFetchAudioSuccess();
}

/** Makes the first fetch (format) fail with the given error message. */
function mockFormatError(message = "Formatting failed", status = 500) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status,
    headers: { get: () => "application/json" },
    json: jest.fn().mockResolvedValue({ error: message }),
    text: jest.fn().mockResolvedValue(JSON.stringify({ error: message })),
  });
}

// ── Initial state ─────────────────────────────────────────────────────────────

describe("useSafetyResponse — initial state", () => {
  it("starts idle with no error and no formattedText", () => {
    const { result } = renderHook(() => useSafetyResponse());
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
    expect(result.current.formattedText).toBeNull();
  });
});

// ── speakSafetyResponse() happy path ─────────────────────────────────────────

describe("useSafetyResponse — happy path", () => {
  it("transitions: idle → formatting → loading → playing", async () => {
    mockFormatThenAudio();
    const { result } = renderHook(() => useSafetyResponse());

    act(() => { void result.current.speakSafetyResponse(VALID_OPTIONS); });
    expect(result.current.status).toBe("formatting");

    await waitFor(() => expect(result.current.status).toBe("playing"));
    expect(result.current.error).toBeNull();
  });

  it("calls format-safety-speech endpoint first", async () => {
    mockFormatThenAudio();
    const { result } = renderHook(() => useSafetyResponse());

    await act(async () => {
      await result.current.speakSafetyResponse(VALID_OPTIONS);
    });

    const [firstUrl, firstOpts] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toContain("format-safety-speech");
    const body = JSON.parse(firstOpts.body as string);
    expect(body.risk_level).toBe("caution");
    expect(body.explanation).toBe(VALID_OPTIONS.explanation);
    expect(body.recommendation).toBe(VALID_OPTIONS.recommendation);
  });

  it("passes the formatted text to text-to-speech as the second fetch", async () => {
    const formatted = "Be careful with ibuprofen around this medicine.";
    mockFormatThenAudio(formatted);
    const { result } = renderHook(() => useSafetyResponse());

    await act(async () => {
      await result.current.speakSafetyResponse(VALID_OPTIONS);
    });

    const [secondUrl, secondOpts] = (global.fetch as jest.Mock).mock.calls[1] as [string, RequestInit];
    expect(secondUrl).toContain("text-to-speech");
    const body = JSON.parse(secondOpts.body as string);
    expect(body.text).toBe(formatted);
  });

  it("exposes formatted text in formattedText state", async () => {
    const formatted = "Please take care with this combination.";
    mockFormatThenAudio(formatted);
    const { result } = renderHook(() => useSafetyResponse());

    await act(async () => {
      await result.current.speakSafetyResponse(VALID_OPTIONS);
    });

    expect(result.current.formattedText).toBe(formatted);
  });

  it("fires onFormatted callback with the formatted text", async () => {
    const formatted = "This could be risky. Please call your doctor.";
    mockFormatThenAudio(formatted);
    const onFormatted = jest.fn();
    const { result } = renderHook(() => useSafetyResponse({ onFormatted }));

    await act(async () => {
      await result.current.speakSafetyResponse(VALID_OPTIONS);
    });

    expect(onFormatted).toHaveBeenCalledWith(formatted);
  });

  it("fires onEnd callback when audio finishes", async () => {
    mockFormatThenAudio();
    const onEnd = jest.fn();
    const { result } = renderHook(() => useSafetyResponse({ onEnd }));

    await act(async () => {
      await result.current.speakSafetyResponse(VALID_OPTIONS);
    });
    act(() => { getLastAudioInstance().onended?.(); });

    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

// ── Preset selection by risk level ─────────────────────────────────────────────

describe("useSafetyResponse — preset selection", () => {
  it.each([
    { riskLevel: "caution" as const, expectedPreset: "followup" },
    { riskLevel: "dangerous" as const, expectedPreset: "followup" },
    { riskLevel: "safe" as const, expectedPreset: "explanation" },
  ])(
    "riskLevel='$riskLevel' uses '$expectedPreset' TTS preset",
    async ({ riskLevel, expectedPreset }) => {
      mockFormatThenAudio();
      const { result } = renderHook(() => useSafetyResponse());

      await act(async () => {
        await result.current.speakSafetyResponse({ ...VALID_OPTIONS, riskLevel });
      });

      const ttsBody = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[1][1].body as string
      );
      expect(ttsBody.preset).toBe(expectedPreset);
    }
  );
});

// ── Error handling ─────────────────────────────────────────────────────────────

describe("useSafetyResponse — error handling", () => {
  it("sets error and returns to idle when format step fails", async () => {
    mockFormatError("Formatting failed", 500);
    const { result } = renderHook(() => useSafetyResponse());

    await act(async () => {
      await result.current.speakSafetyResponse(VALID_OPTIONS);
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.error).toMatch(/Formatting failed/i);
  });

  it("does NOT call text-to-speech when format step fails", async () => {
    mockFormatError();
    const { result } = renderHook(() => useSafetyResponse());

    await act(async () => {
      await result.current.speakSafetyResponse(VALID_OPTIONS);
    });

    // Only 1 fetch call (to format), not 2 (format + TTS)
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("fires onError callback when format step fails", async () => {
    mockFormatError("Claude overloaded");
    const onError = jest.fn();
    const { result } = renderHook(() => useSafetyResponse({ onError }));

    await act(async () => {
      await result.current.speakSafetyResponse(VALID_OPTIONS);
    });

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("resets formattedText to null on a new speakSafetyResponse call", async () => {
    mockFormatThenAudio("First message.");
    const { result } = renderHook(() => useSafetyResponse());

    await act(async () => {
      await result.current.speakSafetyResponse(VALID_OPTIONS);
    });
    expect(result.current.formattedText).toBe("First message.");

    // Second call — format fails this time
    mockFormatError();
    await act(async () => {
      await result.current.speakSafetyResponse(VALID_OPTIONS);
    });
    expect(result.current.formattedText).toBeNull();
  });
});

// ── Controls (delegated to useTextToSpeech) ───────────────────────────────────

describe("useSafetyResponse — playback controls", () => {
  it("stop() while playing resets to idle", async () => {
    mockFormatThenAudio();
    const { result } = renderHook(() => useSafetyResponse());

    await act(async () => {
      await result.current.speakSafetyResponse(VALID_OPTIONS);
    });
    act(() => { result.current.stop(); });

    expect(result.current.status).toBe("idle");
    expect(getLastAudioInstance().pause).toHaveBeenCalled();
  });
});
