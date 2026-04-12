import { renderHook, act, waitFor } from "@testing-library/react";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import {
  mockFetchAudioSuccess,
  mockFetchError,
  getLastAudioInstance,
} from "@/jest.setup";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function speakAndLoad(text = "Take one tablet daily.") {
  const { result } = renderHook(() => useTextToSpeech());
  act(() => { void result.current.speak({ text }); });
  // Flush: loading → audio created
  await waitFor(() => expect(result.current.status).not.toBe("idle"));
  return result;
}

// ── Initial state ─────────────────────────────────────────────────────────────

describe("useTextToSpeech — initial state", () => {
  it("starts idle with no error", () => {
    const { result } = renderHook(() => useTextToSpeech());
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
    expect(result.current.duration).toBe(0);
    expect(result.current.currentTime).toBe(0);
  });
});

// ── speak() ───────────────────────────────────────────────────────────────────

describe("useTextToSpeech — speak()", () => {
  it("transitions to loading then playing on success", async () => {
    mockFetchAudioSuccess();
    const { result } = renderHook(() => useTextToSpeech());

    act(() => { void result.current.speak({ text: "Hello." }); });
    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("playing"));
    expect(result.current.error).toBeNull();
  });

  it("calls fetch with correct endpoint and body", async () => {
    mockFetchAudioSuccess();
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.speak({ text: "Take this pill.", preset: "followup" });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://test-project.supabase.co/functions/v1/text-to-speech",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ apikey: "test-anon-key" }),
        body: JSON.stringify({ text: "Take this pill.", preset: "followup", voiceId: undefined }),
      })
    );
  });

  it("creates an Audio element and calls play()", async () => {
    mockFetchAudioSuccess();
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.speak({ text: "Hello." });
    });

    const audio = getLastAudioInstance();
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.src).toBe("blob:mock-object-url");
  });

  it("creates an object URL from the blob", async () => {
    mockFetchAudioSuccess();
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.speak({ text: "Hello." });
    });

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("passes X-Arise-Meta to onStart callback", async () => {
    const meta = { voiceId: "9BWtsMINqrJLrRacOk9x", preset: "explanation", charCount: 6, generatedAt: "2026-04-12T00:00:00.000Z" };
    mockFetchAudioSuccess(meta);
    const onStart = jest.fn();
    const { result } = renderHook(() => useTextToSpeech({ onStart }));

    await act(async () => {
      await result.current.speak({ text: "Hello." });
    });

    // Simulate the audio play event
    act(() => { getLastAudioInstance().onplay?.(); });
    expect(onStart).toHaveBeenCalledWith(meta);
  });

  it("cancels previous audio when speak() is called again", async () => {
    mockFetchAudioSuccess();
    mockFetchAudioSuccess();
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => { await result.current.speak({ text: "First." }); });
    const firstAudio = getLastAudioInstance();

    await act(async () => { await result.current.speak({ text: "Second." }); });

    expect(firstAudio.pause).toHaveBeenCalled();
  });
});

// ── Error handling ─────────────────────────────────────────────────────────────

describe("useTextToSpeech — error handling", () => {
  it("sets status=error when fetch returns non-ok", async () => {
    mockFetchError("TTS generation failed", 500);
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => { await result.current.speak({ text: "Hello." }); });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/TTS generation failed/i);
  });

  it("calls onError callback on fetch failure", async () => {
    mockFetchError("quota exceeded", 429);
    const onError = jest.fn();
    const { result } = renderHook(() => useTextToSpeech({ onError }));

    await act(async () => { await result.current.speak({ text: "Hello." }); });

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("sets status=error when audio element fires onerror", async () => {
    mockFetchAudioSuccess();
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => { await result.current.speak({ text: "Hello." }); });
    act(() => { getLastAudioInstance().onerror?.(); });

    expect(result.current.status).toBe("error");
  });

  it("revokes the object URL on audio error to avoid memory leak", async () => {
    mockFetchAudioSuccess();
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => { await result.current.speak({ text: "Hello." }); });
    act(() => { getLastAudioInstance().onerror?.(); });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-object-url");
  });
});

// ── stop() ────────────────────────────────────────────────────────────────────

describe("useTextToSpeech — stop()", () => {
  it("pauses audio and resets to idle", async () => {
    mockFetchAudioSuccess();
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => { await result.current.speak({ text: "Hello." }); });
    act(() => { result.current.stop(); });

    expect(result.current.status).toBe("idle");
    expect(getLastAudioInstance().pause).toHaveBeenCalled();
  });

  it("revokes the object URL on stop", async () => {
    mockFetchAudioSuccess();
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => { await result.current.speak({ text: "Hello." }); });
    act(() => { result.current.stop(); });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-object-url");
  });
});

// ── pause() / resume() ────────────────────────────────────────────────────────

describe("useTextToSpeech — pause() and resume()", () => {
  it("pause() while playing → status stays until onpause fires", async () => {
    mockFetchAudioSuccess();
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => { await result.current.speak({ text: "Hello." }); });
    act(() => { getLastAudioInstance().onplay?.(); });    // trigger playing state
    act(() => { result.current.pause(); });

    expect(getLastAudioInstance().pause).toHaveBeenCalled();
  });

  it("resume() while paused calls audio.play()", async () => {
    mockFetchAudioSuccess();
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => { await result.current.speak({ text: "Hello." }); });
    // Simulate: playing → pause event → resume
    act(() => { getLastAudioInstance().onplay?.(); });
    act(() => { result.current.pause(); });
    act(() => { getLastAudioInstance().onpause?.(); });
    act(() => { result.current.resume(); });

    expect(getLastAudioInstance().play).toHaveBeenCalledTimes(2);
  });
});

// ── onEnd callback ─────────────────────────────────────────────────────────────

describe("useTextToSpeech — onEnd callback", () => {
  it("calls onEnd and resets to idle when audio ends naturally", async () => {
    mockFetchAudioSuccess();
    const onEnd = jest.fn();
    const { result } = renderHook(() => useTextToSpeech({ onEnd }));

    await act(async () => { await result.current.speak({ text: "Hello." }); });
    act(() => { getLastAudioInstance().onended?.(); });

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("idle");
  });
});

// ── Cleanup on unmount ────────────────────────────────────────────────────────

describe("useTextToSpeech — unmount cleanup", () => {
  it("pauses audio and revokes URL when component unmounts mid-play", async () => {
    mockFetchAudioSuccess();
    const { result, unmount } = renderHook(() => useTextToSpeech());

    await act(async () => { await result.current.speak({ text: "Hello." }); });
    unmount();

    expect(getLastAudioInstance().pause).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});
