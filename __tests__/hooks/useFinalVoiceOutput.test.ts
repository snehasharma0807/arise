import { renderHook, act, waitFor } from "@testing-library/react";
import { useFinalVoiceOutput } from "@/hooks/useFinalVoiceOutput";
import { mockFetchAudioSuccess, getLastAudioInstance } from "@/jest.setup";

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeJsonResponse(body: object, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

/**
 * Sets up fetch mock for the full non-safe pipeline:
 *   1st call  → format-safety-speech  → { formatted_text }
 *   2nd call  → combine-voice-output  → { final_text, explanation_only: false }
 *   3rd call  → text-to-speech        → audio blob
 */
function mockFullPipeline(
  riskMessage = "Please avoid ibuprofen with this medicine.",
  finalText = "This medicine lowers your blood pressure. Please avoid ibuprofen."
) {
  (global.fetch as jest.Mock)
    .mockResolvedValueOnce(makeJsonResponse({ formatted_text: riskMessage }))
    .mockResolvedValueOnce(makeJsonResponse({ final_text: finalText, explanation_only: false }));
  mockFetchAudioSuccess();
}

/**
 * Sets up fetch mock for the safe pipeline (no formatting step):
 *   1st call  → combine-voice-output  → { final_text, explanation_only: true }
 *   2nd call  → text-to-speech        → audio blob
 */
function mockSafePipeline(
  finalText = "This medicine helps lower your blood pressure."
) {
  (global.fetch as jest.Mock).mockResolvedValueOnce(
    makeJsonResponse({ final_text: finalText, explanation_only: true })
  );
  mockFetchAudioSuccess();
}

const CAUTION_OPTIONS = {
  riskLevel: "caution" as const,
  explanation: "This medicine helps lower your blood pressure.",
  recommendation: "Use paracetamol instead of ibuprofen.",
};

const SAFE_OPTIONS = {
  riskLevel: "safe" as const,
  explanation: "This medicine helps lower your blood pressure.",
};

// ── Initial state ─────────────────────────────────────────────────────────────

describe("useFinalVoiceOutput — initial state", () => {
  it("starts idle with null text and no error", () => {
    const { result } = renderHook(() => useFinalVoiceOutput());
    expect(result.current.status).toBe("idle");
    expect(result.current.finalText).toBeNull();
    expect(result.current.riskMessage).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

// ── Non-safe pipeline (caution / dangerous) ───────────────────────────────────

describe("useFinalVoiceOutput — non-safe pipeline", () => {
  it("starts in 'formatting' and eventually reaches 'playing'", async () => {
    mockFullPipeline();
    const { result } = renderHook(() => useFinalVoiceOutput());

    // Immediately after speak() — first async step hasn't resolved yet
    act(() => { void result.current.speak(CAUTION_OPTIONS); });
    expect(result.current.status).toBe("formatting");

    // Eventually audio plays (all three fetches have resolved)
    await waitFor(() => expect(result.current.status).toBe("playing"));
  });

  it("calls format-safety-speech as the first fetch", async () => {
    mockFullPipeline();
    const { result } = renderHook(() => useFinalVoiceOutput());

    await act(async () => { await result.current.speak(CAUTION_OPTIONS); });

    const [firstUrl, firstOpts] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toContain("format-safety-speech");
    const body = JSON.parse(firstOpts.body as string);
    expect(body.risk_level).toBe("caution");
    expect(body.explanation).toBe(CAUTION_OPTIONS.explanation);
    expect(body.recommendation).toBe(CAUTION_OPTIONS.recommendation);
  });

  it("passes risk message to combine-voice-output as second fetch", async () => {
    const riskMessage = "Be careful with ibuprofen.";
    mockFullPipeline(riskMessage);
    const { result } = renderHook(() => useFinalVoiceOutput());

    await act(async () => { await result.current.speak(CAUTION_OPTIONS); });

    const [secondUrl, secondOpts] = (global.fetch as jest.Mock).mock.calls[1] as [string, RequestInit];
    expect(secondUrl).toContain("combine-voice-output");
    const body = JSON.parse(secondOpts.body as string);
    expect(body.risk_message).toBe(riskMessage);
    expect(body.explanation).toBe(CAUTION_OPTIONS.explanation);
  });

  it("passes final_text to text-to-speech as third fetch", async () => {
    const finalText = "This is your combined message.";
    mockFullPipeline(undefined, finalText);
    const { result } = renderHook(() => useFinalVoiceOutput());

    await act(async () => { await result.current.speak(CAUTION_OPTIONS); });

    const [thirdUrl, thirdOpts] = (global.fetch as jest.Mock).mock.calls[2] as [string, RequestInit];
    expect(thirdUrl).toContain("text-to-speech");
    const body = JSON.parse(thirdOpts.body as string);
    expect(body.text).toBe(finalText);
  });

  it("exposes riskMessage and finalText in state", async () => {
    const riskMessage = "Avoid ibuprofen.";
    const finalText = "Blood pressure pill. Avoid ibuprofen.";
    mockFullPipeline(riskMessage, finalText);
    const { result } = renderHook(() => useFinalVoiceOutput());

    await act(async () => { await result.current.speak(CAUTION_OPTIONS); });

    expect(result.current.riskMessage).toBe(riskMessage);
    expect(result.current.finalText).toBe(finalText);
  });

  it("fires onRiskMessageReady with formatted risk message", async () => {
    const riskMessage = "Please avoid ibuprofen.";
    mockFullPipeline(riskMessage);
    const onRiskMessageReady = jest.fn();
    const { result } = renderHook(() => useFinalVoiceOutput({ onRiskMessageReady }));

    await act(async () => { await result.current.speak(CAUTION_OPTIONS); });

    expect(onRiskMessageReady).toHaveBeenCalledWith(riskMessage);
  });

  it("fires onFinalTextReady with combined text", async () => {
    const finalText = "Combined final message.";
    mockFullPipeline(undefined, finalText);
    const onFinalTextReady = jest.fn();
    const { result } = renderHook(() => useFinalVoiceOutput({ onFinalTextReady }));

    await act(async () => { await result.current.speak(CAUTION_OPTIONS); });

    expect(onFinalTextReady).toHaveBeenCalledWith(finalText);
  });

  it("uses 'followup' TTS preset for caution risk level", async () => {
    mockFullPipeline();
    const { result } = renderHook(() => useFinalVoiceOutput());

    await act(async () => { await result.current.speak(CAUTION_OPTIONS); });

    const ttsBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[2][1].body as string
    );
    expect(ttsBody.preset).toBe("followup");
  });

  it("uses 'followup' TTS preset for dangerous risk level", async () => {
    mockFullPipeline();
    const { result } = renderHook(() => useFinalVoiceOutput());

    await act(async () => {
      await result.current.speak({ ...CAUTION_OPTIONS, riskLevel: "dangerous" });
    });

    const ttsBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[2][1].body as string
    );
    expect(ttsBody.preset).toBe("followup");
  });
});

// ── Safe pipeline (no format step) ───────────────────────────────────────────

describe("useFinalVoiceOutput — safe pipeline", () => {
  it("skips format-safety-speech for 'safe' interactions (only 2 fetches)", async () => {
    mockSafePipeline();
    const { result } = renderHook(() => useFinalVoiceOutput());

    await act(async () => { await result.current.speak(SAFE_OPTIONS); });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const [firstUrl] = (global.fetch as jest.Mock).mock.calls[0] as [string];
    expect(firstUrl).toContain("combine-voice-output");
  });

  it("skips format step when recommendation is absent (even with non-safe risk level)", async () => {
    mockSafePipeline();
    const { result } = renderHook(() => useFinalVoiceOutput());

    await act(async () => {
      await result.current.speak({
        riskLevel: "caution",
        explanation: "Take once daily.",
        // no recommendation provided
      });
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("uses 'explanation' TTS preset for safe interactions", async () => {
    mockSafePipeline();
    const { result } = renderHook(() => useFinalVoiceOutput());

    await act(async () => { await result.current.speak(SAFE_OPTIONS); });

    const ttsBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[1][1].body as string
    );
    expect(ttsBody.preset).toBe("explanation");
  });

  it("leaves riskMessage null for safe interactions", async () => {
    mockSafePipeline();
    const { result } = renderHook(() => useFinalVoiceOutput());

    await act(async () => { await result.current.speak(SAFE_OPTIONS); });

    expect(result.current.riskMessage).toBeNull();
  });
});

// ── Error handling ─────────────────────────────────────────────────────────────

describe("useFinalVoiceOutput — error handling", () => {
  it("sets error and stays idle when format step fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      makeJsonResponse({ error: "Claude overloaded" }, 529)
    );
    const { result } = renderHook(() => useFinalVoiceOutput());

    await act(async () => { await result.current.speak(CAUTION_OPTIONS); });

    expect(result.current.status).toBe("idle");
    expect(result.current.error).toMatch(/Claude overloaded/i);
  });

  it("sets error and stays idle when combine step fails", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(makeJsonResponse({ formatted_text: "Avoid X." }))
      .mockResolvedValueOnce(makeJsonResponse({ error: "Combine failed" }, 500));
    const { result } = renderHook(() => useFinalVoiceOutput());

    await act(async () => { await result.current.speak(CAUTION_OPTIONS); });

    expect(result.current.status).toBe("idle");
    expect(result.current.error).toMatch(/Combine failed/i);
  });

  it("does not call TTS when format step fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      makeJsonResponse({ error: "Error" }, 500)
    );
    const { result } = renderHook(() => useFinalVoiceOutput());

    await act(async () => { await result.current.speak(CAUTION_OPTIONS); });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("fires onError when any step fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      makeJsonResponse({ error: "Oops" }, 500)
    );
    const onError = jest.fn();
    const { result } = renderHook(() => useFinalVoiceOutput({ onError }));

    await act(async () => { await result.current.speak(CAUTION_OPTIONS); });

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("resets finalText and riskMessage to null on new speak() call", async () => {
    mockFullPipeline("Old risk.", "Old final.");
    const { result } = renderHook(() => useFinalVoiceOutput());

    await act(async () => { await result.current.speak(CAUTION_OPTIONS); });
    expect(result.current.finalText).toBe("Old final.");

    // Second call fails at format step — state should reset
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      makeJsonResponse({ error: "Fail" }, 500)
    );
    await act(async () => { await result.current.speak(CAUTION_OPTIONS); });

    expect(result.current.finalText).toBeNull();
    expect(result.current.riskMessage).toBeNull();
  });
});

// ── Playback controls ─────────────────────────────────────────────────────────

describe("useFinalVoiceOutput — playback controls", () => {
  it("stop() resets to idle and pauses audio", async () => {
    mockFullPipeline();
    const { result } = renderHook(() => useFinalVoiceOutput());

    await act(async () => { await result.current.speak(CAUTION_OPTIONS); });
    act(() => { result.current.stop(); });

    expect(result.current.status).toBe("idle");
    expect(getLastAudioInstance().pause).toHaveBeenCalled();
  });

  it("fires onEnd when audio completes naturally", async () => {
    mockFullPipeline();
    const onEnd = jest.fn();
    const { result } = renderHook(() => useFinalVoiceOutput({ onEnd }));

    await act(async () => { await result.current.speak(CAUTION_OPTIONS); });
    act(() => { getLastAudioInstance().onended?.(); });

    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
