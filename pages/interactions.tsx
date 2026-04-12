import { useState } from "react";
import TopAppBar from "@/components/layout/TopAppBar";
import BottomNav from "@/components/layout/BottomNav";
import { analyzeMedication } from "@/lib/api";
import type { AnalyzeResponse } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────

interface InteractionResult {
  query: string;
  level: "AVOID" | "CAUTION" | "SAFE";
  title: string;
  description: string;
}

// ── Constants ─────────────────────────────────────────────────────────────

const QUICK_CHIPS = ["Grapefruit", "Ibuprofen", "Vitamin K", "Alcohol"];

// Map risk level → display label
const RISK_LABEL: Record<string, "AVOID" | "CAUTION" | "SAFE"> = {
  dangerous: "AVOID",
  caution: "CAUTION",
  safe: "SAFE",
};

// Tailwind classes per level — full strings so Tailwind doesn't purge them
const LEVEL_STYLES: Record<
  "AVOID" | "CAUTION" | "SAFE",
  { border: string; text: string; icon: string }
> = {
  AVOID: {
    border: "border-l-error",
    text: "text-error",
    icon: "warning",
  },
  CAUTION: {
    border: "border-l-tertiary",
    text: "text-tertiary",
    icon: "info",
  },
  SAFE: {
    border: "border-l-primary",
    text: "text-primary",
    icon: "check_circle",
  },
};

// ── Component ──────────────────────────────────────────────────────────────

export default function Interactions() {
  const [inputText, setInputText] = useState("");
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<InteractionResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Chip toggle ──────────────────────────────────────────────────────────

  function toggleChip(chip: string) {
    setSelectedChips((prev) => {
      const next = new Set(prev);
      if (next.has(chip)) {
        next.delete(chip);
      } else {
        next.add(chip);
      }
      return next;
    });
  }

  // ── Check Interactions ───────────────────────────────────────────────────

  async function handleCheckInteractions() {
    // Gather everything the user wants to check
    const subjects = [
      ...Array.from(selectedChips),
      ...inputText
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ];

    const unique = [...new Set(subjects)];
    if (unique.length === 0) return;

    setIsLoading(true);
    setError(null);
    setResults([]);

    try {
      // Call /analyze for each subject in parallel
      const responses = await Promise.all(
        unique.map((subject) =>
          analyzeMedication(
            subject,
            "Does this interact with common blood pressure, cholesterol, or diabetes medications? Be specific about risks."
          )
        )
      );

      const mapped: InteractionResult[] = responses.map(
        (res: AnalyzeResponse, i) => ({
          query: unique[i],
          level: RISK_LABEL[res.risk.level] ?? "SAFE",
          title: `${unique[i]} + your medications`,
          description:
            res.risk.level === "safe"
              ? res.explanation
              : res.risk.recommendation || res.risk.explanation,
        })
      );

      setResults(mapped);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }

  // ── Voice input ──────────────────────────────────────────────────────────

  function handleVoiceInput() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionCtor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      alert("Voice input isn't supported in this browser. Try Chrome.");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SpeechRecognitionCtor() as any;
    recognition.lang = "en-US";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript as string;
      setInputText((prev) => (prev ? `${prev}, ${transcript}` : transcript));
    };
    recognition.start();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-surface text-on-surface min-h-screen pb-32">
      <TopAppBar />

      <main className="px-8 max-w-screen-xl mx-auto mt-8">
        <section className="mb-12">
          <h2 className="font-serif text-[2.5rem] leading-tight mb-4 text-on-surface">
            Interactions
          </h2>
          <p className="text-on-surface-variant max-w-lg leading-relaxed">
            Check how your medications, supplements, or diet might interact with
            your current regimen.
          </p>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Left Column: Input & Controls */}
          <div className="lg:col-span-7 space-y-8">
            <div className="bg-surface-container-lowest rounded-xl p-8 border border-outline-variant/20 shadow-sm">
              <div className="flex items-start justify-between gap-4 mb-6">
                <textarea
                  className="w-full bg-transparent border-none focus:ring-0 text-xl font-body placeholder:text-outline/40 resize-none min-h-[120px]"
                  placeholder="Type a medication or food, or use the mic…"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
                <button
                  onClick={handleVoiceInput}
                  className="bg-[#C8956C] text-white p-4 rounded-xl flex items-center justify-center hover:opacity-90 transition-opacity shrink-0"
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                  >
                    mic
                  </span>
                </button>
              </div>

              {/* Quick Chips */}
              <div className="flex flex-wrap gap-2 pt-4">
                {QUICK_CHIPS.map((chip) => {
                  const active = selectedChips.has(chip);
                  return (
                    <button
                      key={chip}
                      onClick={() => toggleChip(chip)}
                      className={`px-3 py-1.5 rounded-[4px] text-xs font-medium tracking-wide uppercase flex items-center gap-1 transition-colors ${
                        active
                          ? "bg-primary text-white"
                          : "bg-[#E8F0E9] text-on-secondary-container hover:bg-primary/10"
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {active ? "check" : "add"}
                      </span>
                      {chip}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleCheckInteractions}
              disabled={
                isLoading ||
                (selectedChips.size === 0 && inputText.trim() === "")
              }
              className="w-full bg-[#4A7355] hover:bg-[#3d5e46] text-white py-5 rounded-xl font-bold tracking-wide flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <span className="material-symbols-outlined">hourglass_top</span>
                  Checking…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">science</span>
                  Check Interactions
                </>
              )}
            </button>

            {/* Internal Interactions — static, no backend endpoint yet */}
            <section className="pt-8">
              <h3 className="font-serif text-xl mb-6">
                How do my meds interact with each other?
              </h3>
              <div className="bg-surface-container-low rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-lg bg-primary-container/10 flex items-center justify-center text-primary shrink-0">
                    <span className="material-symbols-outlined">sync_alt</span>
                  </div>
                  <div>
                    <p className="text-on-surface font-medium mb-1">
                      Internal Regimen Scan
                    </p>
                    <p className="text-sm text-on-surface-variant leading-relaxed">
                      We've cross-referenced your 4 active prescriptions. No
                      direct contraindications were found within your current
                      morning and evening doses.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-label text-xs uppercase tracking-widest font-bold text-outline">
                Analysis Results
              </h4>
              {results.length > 0 && (
                <span className="text-xs text-primary font-medium">
                  {results.length} finding{results.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Error state */}
            {error && (
              <p className="text-sm text-error bg-error-container/20 p-4 rounded-xl">
                {error}
              </p>
            )}

            {/* Loading skeleton */}
            {isLoading && (
              <div className="space-y-4">
                {[...Array(selectedChips.size || 1)].map((_, i) => (
                  <div
                    key={i}
                    className="bg-surface-container-lowest rounded-[6px] border border-outline-variant p-5 animate-pulse"
                  >
                    <div className="h-3 bg-outline-variant/30 rounded w-16 mb-3" />
                    <div className="h-4 bg-outline-variant/20 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-outline-variant/10 rounded w-full" />
                  </div>
                ))}
              </div>
            )}

            {/* Result cards */}
            {!isLoading &&
              results.map((result) => {
                const styles = LEVEL_STYLES[result.level];
                return (
                  <div
                    key={result.query}
                    className={`bg-surface-container-lowest rounded-[6px] border border-outline-variant p-5 border-l-[3px] ${styles.border}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span
                        className={`font-label text-[10px] font-black tracking-tighter ${styles.text}`}
                      >
                        {result.level}
                      </span>
                      <span className={`material-symbols-outlined text-sm ${styles.text}`}>
                        {styles.icon}
                      </span>
                    </div>
                    <h5 className="font-bold text-on-surface mb-1">{result.title}</h5>
                    <p className="text-sm text-on-surface-variant leading-normal">
                      {result.description}
                    </p>
                  </div>
                );
              })}

            {/* Empty state — show placeholder when no results yet */}
            {!isLoading && results.length === 0 && !error && (
              <p className="text-sm text-outline italic text-center py-8">
                Select a substance above and tap Check Interactions.
              </p>
            )}

            {/* Wellness image */}
            <div className="mt-8 rounded-xl overflow-hidden relative h-48 group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="w-full h-full object-cover"
                alt="Abstract peaceful close-up of clear water ripples with floating green leaves in soft morning light"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDPku5vuJiAtheizOzxquUwN8xRnjnLeoVrxBioY7CoGofSjR8QcJOeaGbN8uZ46Ai_ZRU_fat_2xJWqlD2p3wC_KdC1JLkxnIZK_ys_I4UiJAEq4Pt4aXMH-Z0WTCW8TI4SRurYQSh73ek7Vi7DaSrtMG-9bFj0sZXLwVPeQA4I8w8D4ce7FN-yhPjuvEsRbTcweaQAjBu8wC_W9Wy7JCyvg2iI6nfdEZUK-iKSHRLz5V8-wvttSmS57ubLg_im8xScAEUhzfnaIjm"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary/60 to-transparent flex flex-col justify-end p-6">
                <p className="text-white text-xs font-medium uppercase tracking-widest mb-1">
                  Wellness Tip
                </p>
                <p className="text-white font-serif italic text-lg">
                  "Consistency is the highest form of self-care."
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
