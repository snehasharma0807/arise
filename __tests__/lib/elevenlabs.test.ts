import {
  ARISE_VOICES,
  VOICE_PRESETS,
  ELEVENLABS_MODEL,
  ELEVENLABS_OUTPUT_FORMAT,
  SAFETY_COLORS,
  type SafetyLevel,
} from "@/lib/elevenlabs";

describe("ARISE_VOICES", () => {
  it("exposes aria and rachel voice IDs as non-empty strings", () => {
    expect(typeof ARISE_VOICES.aria).toBe("string");
    expect(ARISE_VOICES.aria.length).toBeGreaterThan(0);
    expect(typeof ARISE_VOICES.rachel).toBe("string");
    expect(ARISE_VOICES.rachel.length).toBeGreaterThan(0);
  });

  it("aria and rachel are different voices", () => {
    expect(ARISE_VOICES.aria).not.toBe(ARISE_VOICES.rachel);
  });
});

describe("VOICE_PRESETS", () => {
  const presets = ["explanation", "followup"] as const;

  it.each(presets)('"%s" preset has all required fields', (preset) => {
    const p = VOICE_PRESETS[preset];
    expect(p).toHaveProperty("stability");
    expect(p).toHaveProperty("similarity_boost");
    expect(p).toHaveProperty("style");
    expect(p).toHaveProperty("use_speaker_boost");
  });

  it.each(presets)('"%s" stability is between 0 and 1', (preset) => {
    const { stability } = VOICE_PRESETS[preset];
    expect(stability).toBeGreaterThanOrEqual(0);
    expect(stability).toBeLessThanOrEqual(1);
  });

  it.each(presets)('"%s" similarity_boost is between 0 and 1', (preset) => {
    const { similarity_boost } = VOICE_PRESETS[preset];
    expect(similarity_boost).toBeGreaterThanOrEqual(0);
    expect(similarity_boost).toBeLessThanOrEqual(1);
  });

  it.each(presets)('"%s" style is between 0 and 1', (preset) => {
    const { style } = VOICE_PRESETS[preset];
    expect(style).toBeGreaterThanOrEqual(0);
    expect(style).toBeLessThanOrEqual(1);
  });

  it("explanation preset is more stable than followup (calmer for medication reads)", () => {
    expect(VOICE_PRESETS.explanation.stability).toBeGreaterThan(
      VOICE_PRESETS.followup.stability
    );
  });

  it("use_speaker_boost is true for all presets", () => {
    presets.forEach((p) => {
      expect(VOICE_PRESETS[p].use_speaker_boost).toBe(true);
    });
  });
});

describe("model and output format constants", () => {
  it("uses the turbo model for low latency", () => {
    expect(ELEVENLABS_MODEL).toBe("eleven_turbo_v2_5");
  });

  it("uses mp3_44100_128 output format", () => {
    expect(ELEVENLABS_OUTPUT_FORMAT).toBe("mp3_44100_128");
  });
});

describe("SAFETY_COLORS", () => {
  const levels: SafetyLevel[] = ["safe", "caution", "dangerous"];
  const hexPattern = /^#[0-9a-fA-F]{6}$/;

  it.each(levels)('"%s" maps to a valid hex colour', (level) => {
    expect(SAFETY_COLORS[level]).toMatch(hexPattern);
  });

  it("all three safety levels have distinct colours", () => {
    const colours = Object.values(SAFETY_COLORS);
    const unique = new Set(colours);
    expect(unique.size).toBe(colours.length);
  });

  it("safe is green-family, dangerous is red-family", () => {
    // safe → green (#22c55e), dangerous → red (#ef4444)
    expect(SAFETY_COLORS.safe.toLowerCase()).toMatch(/^#2/);
    expect(SAFETY_COLORS.dangerous.toLowerCase()).toMatch(/^#e/);
  });
});
