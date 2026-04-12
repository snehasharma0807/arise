/**
 * SpeechPlayer — Arise audio playback component.
 *
 * Wraps `useTextToSpeech` in a single self-contained button + progress bar.
 * Designed to be large-touch-target friendly for elderly users.
 *
 * Usage (UI teammate):
 * ─────────────────────────────────────────────────────────────────────────────
 *   // Medication explanation (auto-plays when text arrives)
 *   <SpeechPlayer
 *     text="This medicine helps lower your blood pressure. Take one tablet every morning with water."
 *     preset="explanation"
 *     autoPlay
 *   />
 *
 *   // Drug-interaction follow-up with safety badge
 *   <SpeechPlayer
 *     text="Taking ibuprofen with this medication can raise your blood pressure."
 *     preset="followup"
 *     safetyLevel="caution"
 *     label="Hear safety advice"
 *   />
 *
 *   // Caregiver card — silent (no auto-play), just shows a play button
 *   <SpeechPlayer text={caregiverSummaryText} label="Play summary" />
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use client";

import { useEffect, useRef } from "react";
import { useTextToSpeech, type SpeakOptions } from "@/hooks/useTextToSpeech";
import { SAFETY_COLORS, type SafetyLevel } from "@/lib/elevenlabs";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SpeechPlayerProps {
  /** The speech-optimised text to read aloud */
  text: string;
  /**
   * Voice preset:
   *   "explanation" → slow, warm (medication description)
   *   "followup"    → slightly livelier (drug-interaction response)
   * @default "explanation"
   */
  preset?: SpeakOptions["preset"];
  /** Override the ElevenLabs voice ID */
  voiceId?: string;
  /** If true, audio plays automatically when the component mounts or text changes */
  autoPlay?: boolean;
  /** Label shown on the play button */
  label?: string;
  /**
   * Safety classification from the Claude integration teammate.
   * Shows a coloured badge and adjusts the button colour.
   */
  safetyLevel?: SafetyLevel;
  /** Called when audio finishes */
  onEnd?: () => void;
  /** Additional CSS class for the outer wrapper */
  className?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Icon components (inline SVG — no icon library dependency) ──────────────

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28" aria-hidden="true">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
      <path d="M6 6h12v12H6z" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      width="24"
      height="24"
      aria-hidden="true"
      style={{ animation: "arise-spin 0.9s linear infinite" }}
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function SpeechPlayer({
  text,
  preset = "explanation",
  voiceId,
  autoPlay = false,
  label = "Listen",
  safetyLevel,
  onEnd,
  className = "",
}: SpeechPlayerProps) {
  const { speak, stop, pause, resume, status, error, duration, currentTime } =
    useTextToSpeech({ onEnd });

  // Track the last text we auto-played so we don't replay on unrelated re-renders
  const lastAutoPlayText = useRef<string | null>(null);

  useEffect(() => {
    if (autoPlay && text && text !== lastAutoPlayText.current) {
      lastAutoPlayText.current = text;
      speak({ text, preset, voiceId });
    }
  }, [autoPlay, text, preset, voiceId, speak]);

  // ── Derived state ──────────────────────────────────────────────────────

  const isLoading = status === "loading";
  const isPlaying = status === "playing";
  const isPaused = status === "paused";
  const isActive = isLoading || isPlaying || isPaused;

  const safetyColor = safetyLevel ? SAFETY_COLORS[safetyLevel] : undefined;

  const progress =
    duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;

  // ── Button logic ───────────────────────────────────────────────────────

  function handleMainClick() {
    if (isLoading) return;
    if (isPlaying) {
      pause();
    } else if (isPaused) {
      resume();
    } else {
      speak({ text, preset, voiceId });
    }
  }

  function getAriaLabel(): string {
    if (isLoading) return "Generating audio, please wait";
    if (isPlaying) return "Pause";
    if (isPaused) return "Resume";
    return label;
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Keyframe animation injected once into the page */}
      <style>{`
        @keyframes arise-spin { to { transform: rotate(360deg); } }
        @keyframes arise-pulse { 0%,100%{opacity:1} 50%{opacity:.55} }
        .arise-player-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 22px;
          border: none;
          border-radius: 16px;
          cursor: pointer;
          font-size: 17px;
          font-weight: 600;
          letter-spacing: 0.01em;
          transition: background 0.18s ease, transform 0.12s ease, box-shadow 0.18s ease;
          min-width: 180px;
          min-height: 58px;  /* large touch target for elderly users */
          user-select: none;
        }
        .arise-player-btn:not(:disabled):active { transform: scale(0.97); }
        .arise-player-btn:disabled { opacity: 0.65; cursor: not-allowed; }
        .arise-progress-bar { transition: width 0.25s linear; }
      `}</style>

      <div
        className={className}
        style={{ display: "inline-flex", flexDirection: "column", gap: 10 }}
      >
        {/* ── Safety badge ── */}
        {safetyLevel && (
          <span
            style={{
              alignSelf: "flex-start",
              background: safetyColor,
              color: "#fff",
              borderRadius: 999,
              padding: "3px 12px",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {safetyLevel}
          </span>
        )}

        {/* ── Main play / pause button ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            className="arise-player-btn"
            onClick={handleMainClick}
            disabled={isLoading}
            aria-label={getAriaLabel()}
            style={{
              background: isActive
                ? safetyColor ?? "#4f46e5"   // indigo-600 default
                : "#f3f4f6",                  // gray-100 when idle
              color: isActive ? "#fff" : "#111827",
              boxShadow: isActive
                ? "0 4px 14px rgba(79,70,229,0.35)"
                : "0 1px 4px rgba(0,0,0,0.08)",
            }}
          >
            {isLoading ? (
              <LoadingSpinner />
            ) : isPlaying ? (
              <PauseIcon />
            ) : (
              <PlayIcon />
            )}
            <span
              style={{
                animation:
                  isPlaying ? "arise-pulse 2s ease-in-out infinite" : "none",
              }}
            >
              {isLoading
                ? "Loading…"
                : isPlaying
                ? "Playing…"
                : isPaused
                ? "Resume"
                : label}
            </span>
          </button>

          {/* Stop button — only visible when audio is active */}
          {isActive && (
            <button
              onClick={stop}
              aria-label="Stop"
              title="Stop"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 42,
                height: 42,
                borderRadius: 12,
                border: "none",
                background: "#fee2e2",
                color: "#dc2626",
                cursor: "pointer",
                flexShrink: 0,
                transition: "background 0.15s ease",
              }}
            >
              <StopIcon />
            </button>
          )}
        </div>

        {/* ── Progress bar (visible while audio is active) ── */}
        {isActive && duration > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              paddingLeft: 4,
            }}
          >
            <div
              style={{
                flex: 1,
                height: 6,
                background: "#e5e7eb",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                className="arise-progress-bar"
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  background: safetyColor ?? "#4f46e5",
                  borderRadius: 999,
                }}
              />
            </div>
            <span
              style={{
                fontSize: 12,
                color: "#6b7280",
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        )}

        {/* ── Error message ── */}
        {error && status === "error" && (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "#dc2626",
              maxWidth: 300,
            }}
            role="alert"
          >
            ⚠️ {error}. Please try again.
          </p>
        )}
      </div>
    </>
  );
}
