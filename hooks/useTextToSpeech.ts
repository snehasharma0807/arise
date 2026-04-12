/**
 * useTextToSpeech — React hook for Arise TTS playback.
 *
 * Calls the `text-to-speech` Supabase Edge Function and manages audio state.
 *
 * Usage (UI teammate):
 * ─────────────────────────────────────────────────────────────────────────────
 *   const { speak, stop, pause, resume, status, error } = useTextToSpeech();
 *
 *   // Play a medication explanation (warm Aria voice, slow/stable preset)
 *   await speak({ text: "This is your blood pressure medication...", preset: "explanation" });
 *
 *   // Play a drug-interaction follow-up (same voice, slightly livelier)
 *   await speak({ text: "Taking ibuprofen with this is not recommended...", preset: "followup" });
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Requires these env vars in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { TTSRequest, TTSResponseMeta, SafetyLevel } from "@/lib/elevenlabs";

// ── Types ──────────────────────────────────────────────────────────────────

export type SpeechStatus = "idle" | "loading" | "playing" | "paused" | "error";

export interface SpeakOptions extends TTSRequest {
  /** Optional safety level — UI teammate can use this to colour the player */
  safetyLevel?: SafetyLevel;
}

export interface UseTextToSpeechCallbacks {
  /** Fired when audio starts playing */
  onStart?: (meta: TTSResponseMeta | null) => void;
  /** Fired when audio finishes naturally */
  onEnd?: () => void;
  /** Fired on any error */
  onError?: (error: Error) => void;
}

export interface UseTextToSpeechReturn {
  /** Generate and play speech for the given text */
  speak: (options: SpeakOptions) => Promise<void>;
  /** Stop playback and discard current audio */
  stop: () => void;
  /** Pause playback at the current position */
  pause: () => void;
  /** Resume from where it was paused */
  resume: () => void;
  /** Current playback state */
  status: SpeechStatus;
  /** Human-readable error message, or null */
  error: string | null;
  /** Duration of current audio in seconds (0 until loaded) */
  duration: number;
  /** Current playback position in seconds */
  currentTime: number;
}

// ── Edge Function URL ──────────────────────────────────────────────────────

function getTTSEndpoint(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set. Check your .env.local file."
    );
  }
  return `${supabaseUrl}/functions/v1/text-to-speech`;
}

function getAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set. Check your .env.local file."
    );
  }
  return key;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useTextToSpeech(
  callbacks: UseTextToSpeechCallbacks = {}
): UseTextToSpeechReturn {
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Stable refs — no re-render needed for internal bookkeeping
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Keep callbacks in a ref so speak() closure is always up-to-date
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  // ── Cleanup ──────────────────────────────────────────────────────────────

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current.load(); // reset HTMLAudioElement
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setDuration(0);
    setCurrentTime(0);
  }, []);

  // Abort any in-flight request and clean up when the component unmounts
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      cleanupAudio();
    };
  }, [cleanupAudio]);

  // ── speak ────────────────────────────────────────────────────────────────

  const speak = useCallback(
    async ({ text, preset = "explanation", voiceId }: SpeakOptions) => {
      // Cancel any previous request / playback
      abortControllerRef.current?.abort();
      cleanupAudio();
      setError(null);
      setStatus("loading");

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const endpoint = getTTSEndpoint();
        const anonKey = getAnonKey();

        const response = await fetch(endpoint, {
          method: "POST",
          signal: abortController.signal,
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
          },
          body: JSON.stringify({ text, preset, voiceId } satisfies TTSRequest),
        });

        // Parse metadata from response header (if present)
        let meta: TTSResponseMeta | null = null;
        try {
          const raw = response.headers.get("X-Arise-Meta");
          if (raw) meta = JSON.parse(raw) as TTSResponseMeta;
        } catch {
          // Non-critical — metadata is informational only
        }

        if (!response.ok) {
          const detail = await response
            .json()
            .catch(() => ({ error: "Unknown error" }));
          throw new Error(
            (detail as { error?: string }).error ?? "TTS request failed"
          );
        }

        // Collect the full stream into a blob for reliable <audio> playback.
        // For the short 2–3 sentence responses Arise generates, this is
        // imperceptibly faster than true MediaSource streaming and much simpler.
        const audioBlob = await response.blob();

        // Check if we were aborted while waiting for the blob
        if (abortController.signal.aborted) return;

        const objectUrl = URL.createObjectURL(audioBlob);
        objectUrlRef.current = objectUrl;

        const audio = new Audio(objectUrl);
        audioRef.current = audio;

        // ── Wire up audio events ────────────────────────────────────────

        audio.onloadedmetadata = () => setDuration(audio.duration);

        audio.ontimeupdate = () => setCurrentTime(audio.currentTime);

        audio.onplay = () => {
          setStatus("playing");
          callbacksRef.current.onStart?.(meta);
        };

        audio.onpause = () => {
          // onpause fires both for user-initiated pauses AND when the track ends
          // before onended fires, so only set "paused" if we're not at the end.
          if (!audio.ended) setStatus("paused");
        };

        audio.onended = () => {
          setStatus("idle");
          cleanupAudio();
          callbacksRef.current.onEnd?.();
        };

        audio.onerror = () => {
          const err = new Error("Audio playback failed");
          setStatus("error");
          setError(err.message);
          callbacksRef.current.onError?.(err);
          cleanupAudio();
        };

        await audio.play();
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          // Intentionally cancelled — reset quietly
          setStatus("idle");
          return;
        }
        const error = err instanceof Error ? err : new Error("Unknown error");
        setStatus("error");
        setError(error.message);
        callbacksRef.current.onError?.(error);
      }
    },
    [cleanupAudio]
  );

  // ── Controls ─────────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    cleanupAudio();
    setStatus("idle");
    setError(null);
  }, [cleanupAudio]);

  const pause = useCallback(() => {
    if (audioRef.current && status === "playing") {
      audioRef.current.pause();
      // Status is set by the onpause event handler above
    }
  }, [status]);

  const resume = useCallback(() => {
    if (audioRef.current && status === "paused") {
      audioRef.current.play().catch((err: Error) => {
        setStatus("error");
        setError(err.message);
      });
    }
  }, [status]);

  return { speak, stop, pause, resume, status, error, duration, currentTime };
}
