import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { SpeechPlayer } from "@/components/SpeechPlayer";
import { mockFetchAudioSuccess, mockFetchError, getLastAudioInstance } from "@/jest.setup";

const TEXT = "Take one tablet every morning with water.";

// ── Rendering ─────────────────────────────────────────────────────────────────

describe("SpeechPlayer — rendering", () => {
  it("renders the play button with default label", () => {
    render(<SpeechPlayer text={TEXT} />);
    expect(screen.getByRole("button", { name: /listen/i })).toBeInTheDocument();
  });

  it("renders a custom label", () => {
    render(<SpeechPlayer text={TEXT} label="Hear advice" />);
    expect(screen.getByRole("button", { name: /hear advice/i })).toBeInTheDocument();
  });

  it("does NOT render a safety badge when safetyLevel is omitted", () => {
    render(<SpeechPlayer text={TEXT} />);
    expect(screen.queryByText(/safe|caution|dangerous/i)).toBeNull();
  });

  it.each(["safe", "caution", "dangerous"] as const)(
    "renders a '%s' badge when safetyLevel='%s'",
    (level) => {
      render(<SpeechPlayer text={TEXT} safetyLevel={level} />);
      expect(screen.getByText(level)).toBeInTheDocument();
    }
  );

  it("does NOT render a stop button in idle state", () => {
    render(<SpeechPlayer text={TEXT} />);
    expect(screen.queryByRole("button", { name: /stop/i })).toBeNull();
  });
});

// ── Interaction — play ────────────────────────────────────────────────────────

describe("SpeechPlayer — play interaction", () => {
  it("shows 'Loading…' while fetching", async () => {
    // Don't resolve fetch immediately — use a stalled promise
    (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));

    render(<SpeechPlayer text={TEXT} />);
    fireEvent.click(screen.getByRole("button", { name: /listen/i }));

    await waitFor(() =>
      expect(screen.getByText(/loading/i)).toBeInTheDocument()
    );
  });

  it("shows 'Playing…' and a Stop button while audio is active", async () => {
    mockFetchAudioSuccess();
    render(<SpeechPlayer text={TEXT} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /listen/i }));
    });

    // Simulate audio starting
    act(() => { getLastAudioInstance().onplay?.(); });

    await waitFor(() =>
      expect(screen.getByText(/playing/i)).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument();
  });

  it("stop button pauses audio and returns to idle", async () => {
    mockFetchAudioSuccess();
    render(<SpeechPlayer text={TEXT} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /listen/i }));
    });
    act(() => { getLastAudioInstance().onplay?.(); });

    await waitFor(() => screen.getByRole("button", { name: /stop/i }));
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));

    expect(getLastAudioInstance().pause).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /stop/i })).toBeNull()
    );
  });
});

// ── Interaction — pause / resume ──────────────────────────────────────────────

describe("SpeechPlayer — pause and resume", () => {
  it("clicking the main button while playing shows Pause → Resume", async () => {
    mockFetchAudioSuccess();
    render(<SpeechPlayer text={TEXT} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /listen/i }));
    });
    act(() => { getLastAudioInstance().onplay?.(); });
    await waitFor(() => screen.getByText(/playing/i));

    // Click to pause
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    act(() => { getLastAudioInstance().onpause?.(); });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /resume/i })).toBeInTheDocument()
    );
  });
});

// ── autoPlay ──────────────────────────────────────────────────────────────────

describe("SpeechPlayer — autoPlay", () => {
  it("calls speak automatically on mount when autoPlay=true", async () => {
    mockFetchAudioSuccess();
    render(<SpeechPlayer text={TEXT} autoPlay />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });

  it("does NOT auto-play when autoPlay is omitted", async () => {
    render(<SpeechPlayer text={TEXT} />);
    // Small delay to confirm no fetch was triggered
    await new Promise((r) => setTimeout(r, 20));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not re-trigger on unrelated re-renders", async () => {
    mockFetchAudioSuccess();
    const { rerender } = render(<SpeechPlayer text={TEXT} autoPlay />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    // Re-render with same text — should NOT trigger a second fetch
    rerender(<SpeechPlayer text={TEXT} autoPlay />);
    await new Promise((r) => setTimeout(r, 30));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

// ── Error state ───────────────────────────────────────────────────────────────

describe("SpeechPlayer — error state", () => {
  it("displays an error message when TTS fails", async () => {
    mockFetchError("TTS generation failed", 500);
    render(<SpeechPlayer text={TEXT} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /listen/i }));
    });

    await waitFor(() =>
      expect(screen.getByRole("alert")).toBeInTheDocument()
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/try again/i);
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe("SpeechPlayer — accessibility", () => {
  it("main button has an accessible aria-label in idle state", () => {
    render(<SpeechPlayer text={TEXT} label="Hear medication info" />);
    const btn = screen.getByRole("button", { name: /hear medication info/i });
    expect(btn).toBeInTheDocument();
  });

  it("main button is disabled (not clickable) while loading", async () => {
    (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
    render(<SpeechPlayer text={TEXT} />);
    fireEvent.click(screen.getByRole("button", { name: /listen/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /generating audio/i })).toBeDisabled()
    );
  });
});
