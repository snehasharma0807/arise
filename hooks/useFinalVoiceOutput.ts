/**
 * useFinalVoiceOutput — full Arise voice pipeline in one hook.
 *
 * Chains all three Claude prompts then ElevenLabs TTS:
 *
 *   Step 1  format-safety-speech   → tone-appropriate risk message
 *   Step 2  combine-voice-output   → blend explanation + risk message
 *   Step 3  text-to-speech         → ElevenLabs audio
 *
 * For "safe" interactions (no drug conflict), step 1 is skipped and the
 * explanation is combined on its own into a warm, reassuring message.
 *
 * Usage (UI teammate — this is the one hook you need for a full response):
 * ─────────────────────────────────────────────────────────────────────────────
 *   const { speak, stop, status, finalText, error } = useFinalVoiceOutput();
 *
 *   // After Claude integration classifies the interaction:
 *   await speak({
 *     riskLevel:      "caution",
 *     explanation:    "This medicine helps lower your blood pressure.",
 *     recommendation: "Avoid ibuprofen. Use paracetamol instead.",
 *   });
 *
 *   // For a safe interaction (no risk message needed):
 *   await speak({
 *     riskLevel:   "safe",
 *     explanation: "This medicine helps lower your blood pressure.",
 *   });
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Status values (in order):
 *   "idle" → "formatting" → "combining" → "loading" → "playing" → "idle"
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use client";

import { useState, useCallback } from "react";
import { useTextToSpeech, type SpeechStatus } from "@/hooks/useTextToSpeech";
import type { SafetyLevel } from "@/lib/elevenlabs";

// ── Types ──────────────────────────────────────────────────────────────────

export type PipelineStatus = SpeechStatus | "formatting" | "combining";

export interface FinalVoiceSpeakOptions {
  /** Safety classification from Claude */
  riskLevel: SafetyLevel;
  /** Plain-language medication explanation (from Claude / label scan) */
  explanation: string;
  /**
   * Claude's recommended action — required for "caution" and "dangerous",
   * optional (or omit entirely) for "safe".
   */
  recommendation?: string;
}

export interface UseFinalVoiceOutputCallbacks {
  /** Fired after format-safety-speech returns (step 1) */
  onRiskMessageReady?: (riskMessage: string) => void;
  /** Fired after combine-voice-output returns with the final blended text (step 2) */
  onFinalTextReady?: (finalText: string) => void;
  /** Fired when audio starts playing (step 3) */
  onStart?: () => void;
  /** Fired when audio finishes */
  onEnd?: () => void;
  /** Fired on any pipeline error */
  onError?: (error: Error) => void;
}

export interface UseFinalVoiceOutputReturn {
  speak: (options: FinalVoiceSpeakOptions) => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  /** Current pipeline stage */
  status: PipelineStatus;
  /** The blended final text (available after step 2 completes) */
  finalText: string | null;
  /** The formatted risk message (available after step 1 completes) */
  riskMessage: string | null;
  error: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return url;
}

function getAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set");
  return key;
}

function presetForRiskLevel(
  riskLevel: SafetyLevel
): "explanation" | "followup" {
  return riskLevel === "safe" ? "explanation" : "followup";
}

async function callEdgeFunction<T>(
  path: string,
  body: object
): Promise<T> {
  const response = await fetch(`${getSupabaseUrl()}/functions/v1/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: getAnonKey(),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error((detail as { error?: string }).error ?? `${path} failed`);
  }

  return response.json() as Promise<T>;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useFinalVoiceOutput(
  callbacks: UseFinalVoiceOutputCallbacks = {}
): UseFinalVoiceOutputReturn {
  const [pipelineStage, setPipelineStage] = useState<
    "idle" | "formatting" | "combining"
  >("idle");
  const [finalText, setFinalText] = useState<string | null>(null);
  const [riskMessage, setRiskMessage] = useState<string | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  const {
    speak: ttSpeak,
    stop,
    pause,
    resume,
    status: ttsStatus,
    error: ttsError,
  } = useTextToSpeech({
    onStart: callbacks.onStart,
    onEnd: callbacks.onEnd,
    onError: callbacks.onError,
  });

  // ── Main pipeline ──────────────────────────────────────────────────────

  const speak = useCallback(
    async ({ riskLevel, explanation, recommendation }: FinalVoiceSpeakOptions) => {
      // Reset
      setFinalText(null);
      setRiskMessage(null);
      setPipelineError(null);

      const isSafe = riskLevel === "safe" || !recommendation?.trim();

      try {
        // ── Step 1: Format risk message (skip for "safe") ──────────────
        let formattedRiskMessage = "";

        if (!isSafe) {
          setPipelineStage("formatting");

          const { formatted_text } = await callEdgeFunction<{
            formatted_text: string;
          }>("format-safety-speech", {
            risk_level: riskLevel,
            explanation,
            recommendation,
          });

          formattedRiskMessage = formatted_text;
          setRiskMessage(formattedRiskMessage);
          callbacks.onRiskMessageReady?.(formattedRiskMessage);
        }

        // ── Step 2: Combine explanation + risk message ─────────────────
        setPipelineStage("combining");

        const { final_text } = await callEdgeFunction<{
          final_text: string;
          explanation_only: boolean;
        }>("combine-voice-output", {
          explanation,
          ...(formattedRiskMessage ? { risk_message: formattedRiskMessage } : {}),
        });

        setFinalText(final_text);
        callbacks.onFinalTextReady?.(final_text);

        // ── Step 3: Speak via ElevenLabs ───────────────────────────────
        setPipelineStage("idle");
        await ttSpeak({
          text: final_text,
          preset: presetForRiskLevel(riskLevel),
          safetyLevel: riskLevel,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Pipeline error");
        setPipelineStage("idle");
        setPipelineError(error.message);
        callbacks.onError?.(error);
      }
    },
    [ttSpeak, callbacks]
  );

  // ── Derived status — pipeline stages take priority over TTS status ─────

  const status: PipelineStatus =
    pipelineStage !== "idle" ? pipelineStage : ttsStatus;

  const error = pipelineError ?? ttsError;

  return { speak, stop, pause, resume, status, finalText, riskMessage, error };
}
