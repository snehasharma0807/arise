import { useState, useRef, useCallback } from "react";
import TopAppBar from "@/components/layout/TopAppBar";
import BottomNav from "@/components/layout/BottomNav";
import { SpeechPlayer } from "@/components/SpeechPlayer";
import { useFinalVoiceOutput } from "@/hooks/useFinalVoiceOutput";
import { useMedications } from "@/context/MedicationsContext";
import { scanMedication, analyzeMedication } from "@/lib/api";
import type { PipelineResponse, AnalyzeResponse } from "@/lib/api";
import type { SafetyLevel } from "@/lib/elevenlabs";

// ── Types ──────────────────────────────────────────────────────────────────

interface UserMessage {
  role: "user";
  text: string;
}

interface AriseMessage {
  role: "arise";
  text: string; // plain explanation — passed to SpeechPlayer
  scanResult?: PipelineResponse;
  analyzeResult?: AnalyzeResponse;
}

type Message = UserMessage | AriseMessage;

// ── Helpers ────────────────────────────────────────────────────────────────

function riskBorderClass(level: string) {
  if (level === "dangerous") return "border-l-error";
  if (level === "caution") return "border-l-tertiary";
  return "border-l-primary";
}

function riskBgClass(level: string) {
  if (level === "dangerous") return "bg-error-container/20";
  if (level === "caution") return "bg-tertiary-fixed/20";
  return "bg-secondary-container/20";
}

// ── Component ──────────────────────────────────────────────────────────────

export default function MyMeds() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentMedication, setCurrentMedication] = useState<string | null>(null);

  const [isListening, setIsListening] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLoading = isScanning || isAnalyzing;

  const { addMedication } = useMedications();

  // Full voice pipeline — auto-plays after scan/analyze
  const { speak, status: voiceStatus, error: voiceError } = useFinalVoiceOutput();

  // ── Scan Pill Bottle ─────────────────────────────────────────────────────

  async function handleImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset so the same file can be re-selected if needed
    if (fileInputRef.current) fileInputRef.current.value = "";

    setIsScanning(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", text: "I scanned a pill bottle." },
    ]);

    try {
      const data = await scanMedication(file);
      setCurrentMedication(data.extraction.medication_name);
      // Add to shared medication list (My Context + Schedule)
      addMedication(data);
      setMessages((prev) => [
        ...prev,
        { role: "arise", text: data.analysis.explanation, scanResult: data },
      ]);

      // Auto-speak via full pipeline
      await speak({
        riskLevel: data.analysis.risk.level as SafetyLevel,
        explanation: data.analysis.explanation,
        recommendation: data.analysis.risk.recommendation,
      });
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "arise",
          text: "Sorry, I had trouble reading that image. Please try a clearer photo.",
        },
      ]);
    } finally {
      setIsScanning(false);
    }
  }

  // ── Text / follow-up questions ───────────────────────────────────────────

  const handleSendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    setInputText("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setIsAnalyzing(true);

    try {
      // If we have a scanned medication, ask about it; otherwise treat the input as the medication name
      const medName = currentMedication ?? text;
      const question = currentMedication ? text : undefined;

      const data = await analyzeMedication(medName, question);
      if (!currentMedication) setCurrentMedication(data.medication_name);

      setMessages((prev) => [
        ...prev,
        { role: "arise", text: data.explanation, analyzeResult: data },
      ]);

      await speak({
        riskLevel: data.risk.level as SafetyLevel,
        explanation: data.explanation,
        recommendation: data.risk.recommendation,
      });
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "arise",
          text: "Sorry, I couldn't process that. Please try again.",
        },
      ]);
    } finally {
      setIsAnalyzing(false);
    }
  }, [inputText, isLoading, currentMedication, speak]);

  // ── Voice input (Web Speech API) ─────────────────────────────────────────

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
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      setInputText(event.results[0][0].transcript as string);
    };
    recognition.start();
  }

  // ── Derived voice status label ────────────────────────────────────────────

  const voiceStatusLabel: Record<string, string> = {
    formatting: "Formatting response…",
    combining: "Combining audio…",
    loading: "Generating audio…",
    playing: "Playing…",
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-col">
      {/* Listening indicator */}
      {isListening && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-primary text-white flex items-center justify-center gap-3 py-3 text-sm font-medium">
          <span
            className="material-symbols-outlined animate-pulse"
            style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
          >
            mic
          </span>
          Listening… speak now
        </div>
      )}

      {/* Hidden file input — capture="environment" opens camera on mobile */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleImageSelected}
      />

      <TopAppBar />

      <main className="flex-grow w-full max-w-screen-md mx-auto px-6 pb-32">
        {/* Hero Actions */}
        <section className="mt-8 space-y-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="w-full bg-[#416448] text-white py-5 rounded-[6px] flex items-center justify-center gap-3 hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {isScanning ? (
              <>
                <span className="material-symbols-outlined">hourglass_top</span>
                <span className="font-medium">Scanning…</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">photo_camera</span>
                <span className="font-medium">Scan Pill Bottle</span>
              </>
            )}
          </button>

          <button
            onClick={handleVoiceInput}
            className="w-full bg-[#F1F4EF] border border-[#C2C8BF]/20 text-[#416448] py-5 rounded-[6px] flex items-center justify-center gap-3 hover:bg-[#E8F0E9] transition-colors"
          >
            <span className="material-symbols-outlined">mic</span>
            <span className="font-medium">Speak to Arise</span>
          </button>
        </section>

        {/* Conversation */}
        {messages.length > 0 && (
          <section className="mt-16 space-y-12">
            {messages.map((msg, i) =>
              msg.role === "user" ? (
                /* User message */
                <div key={i} className="flex justify-end pl-12">
                  <div className="border-l-2 border-primary pl-4 py-1">
                    <p className="text-on-surface leading-relaxed">{msg.text}</p>
                  </div>
                </div>
              ) : (
                /* Arise response */
                <div key={i} className="flex flex-col gap-4">
                  <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-[6px] p-6 shadow-sm">
                    <div className="flex justify-between items-start mb-6">
                      <span className="text-[0.7rem] uppercase tracking-[0.2em] font-bold text-primary">
                        ARISE
                      </span>
                      {/* SpeechPlayer handles its own TTS state per message */}
                      <SpeechPlayer
                        text={msg.text}
                        preset={
                          (msg.scanResult?.analysis.risk.level === "safe" ||
                            msg.analyzeResult?.risk.level === "safe")
                            ? "explanation"
                            : "followup"
                        }
                        safetyLevel={
                          (msg.scanResult?.analysis.risk.level ??
                            msg.analyzeResult?.risk.level) as SafetyLevel | undefined
                        }
                        label="Hear this"
                      />
                    </div>

                    <div className="space-y-6">
                      {/* Scan result — structured display */}
                      {msg.scanResult && (
                        <>
                          <p className="font-serif text-xl text-on-surface">
                            Based on your prescription for{" "}
                            <span className="italic">
                              {msg.scanResult.extraction.medication_name}
                            </span>{" "}
                            ({msg.scanResult.extraction.dosage}):
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-surface-container-low p-4 rounded-[4px]">
                              <span className="block text-[0.65rem] uppercase tracking-widest text-outline mb-1">
                                Dosage
                              </span>
                              <p className="text-lg font-semibold text-on-surface">
                                {msg.scanResult.extraction.dosage}
                              </p>
                            </div>
                            <div className="bg-surface-container-low p-4 rounded-[4px]">
                              <span className="block text-[0.65rem] uppercase tracking-widest text-outline mb-1">
                                Form
                              </span>
                              <p className="text-lg font-semibold text-on-surface capitalize">
                                {msg.scanResult.extraction.form}
                              </p>
                            </div>
                          </div>
                          <div className="pt-2">
                            <span className="block text-[0.65rem] uppercase tracking-widest text-outline mb-3">
                              Summary
                            </span>
                            <p className="text-on-surface leading-relaxed">
                              {msg.scanResult.analysis.explanation}
                            </p>
                          </div>
                          {msg.scanResult.analysis.risk.level !== "safe" &&
                            msg.scanResult.analysis.risk.recommendation && (
                              <div
                                className={`p-4 rounded-[4px] border-l-2 ${riskBorderClass(msg.scanResult.analysis.risk.level)} ${riskBgClass(msg.scanResult.analysis.risk.level)}`}
                              >
                                <span className="block text-[0.65rem] uppercase tracking-widest text-outline mb-1">
                                  {msg.scanResult.analysis.risk.level === "dangerous"
                                    ? "Warning"
                                    : "Caution"}
                                </span>
                                <p className="text-on-surface text-sm leading-relaxed">
                                  {msg.scanResult.analysis.risk.recommendation}
                                </p>
                              </div>
                            )}
                        </>
                      )}

                      {/* Analyze result — plain explanation */}
                      {msg.analyzeResult && (
                        <>
                          <p className="text-on-surface leading-relaxed">
                            {msg.analyzeResult.explanation}
                          </p>
                          {msg.analyzeResult.risk.level !== "safe" &&
                            msg.analyzeResult.risk.recommendation && (
                              <div
                                className={`p-4 rounded-[4px] border-l-2 ${riskBorderClass(msg.analyzeResult.risk.level)} ${riskBgClass(msg.analyzeResult.risk.level)}`}
                              >
                                <span className="block text-[0.65rem] uppercase tracking-widest text-outline mb-1">
                                  {msg.analyzeResult.risk.level === "dangerous"
                                    ? "Warning"
                                    : "Caution"}
                                </span>
                                <p className="text-on-surface text-sm leading-relaxed">
                                  {msg.analyzeResult.risk.recommendation}
                                </p>
                              </div>
                            )}
                        </>
                      )}

                      {/* Plain text (e.g. error messages) */}
                      {!msg.scanResult && !msg.analyzeResult && (
                        <p className="text-on-surface leading-relaxed">{msg.text}</p>
                      )}
                    </div>
                  </div>
                </div>
              )
            )}

            {/* Thinking indicator */}
            {isLoading && (
              <div className="flex flex-col gap-4">
                <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-[6px] p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-[0.7rem] uppercase tracking-[0.2em] font-bold text-primary">
                      ARISE
                    </span>
                    <span className="text-outline text-sm animate-pulse">
                      {isScanning ? "Reading your medication…" : "Thinking…"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Voice pipeline status (shown while auto-speaking after scan) */}
        {voiceStatusLabel[voiceStatus] && (
          <p className="mt-4 text-center text-sm text-outline animate-pulse">
            {voiceStatusLabel[voiceStatus]}
          </p>
        )}
        {voiceError && (
          <p className="mt-4 text-center text-sm text-error">{voiceError}</p>
        )}

        {/* Ritual Tracker — static for now, no backend endpoint yet */}
        {messages.some((m) => m.role === "arise") && (
          <div className="flex justify-center py-8 mt-4">
            <div className="relative w-48 h-48 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90">
                <circle cx="96" cy="96" fill="transparent" r="80" stroke="#ffdcc2" strokeWidth="12" />
                <circle
                  cx="96"
                  cy="96"
                  fill="transparent"
                  r="80"
                  stroke="#416448"
                  strokeDasharray="502"
                  strokeDashoffset="125"
                  strokeLinecap="butt"
                  strokeWidth="12"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="font-serif text-5xl text-on-surface">3/4</span>
                <span className="text-[0.6rem] uppercase tracking-widest text-outline font-bold mt-1">
                  Today's Ritual
                </span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Input Area */}
      <div className="fixed bottom-16 left-0 w-full px-6 py-4 bg-gradient-to-t from-surface via-surface to-transparent pointer-events-none">
        <div className="max-w-screen-md mx-auto flex items-center gap-3 pointer-events-auto">
          <div className="flex-grow relative">
            <input
              className="w-full bg-surface-container-lowest border-none ring-1 ring-outline-variant/30 rounded-full py-4 px-6 text-on-surface focus:ring-2 focus:ring-primary placeholder:text-outline/50 disabled:opacity-60"
              placeholder="Ask Arise anything…"
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={isLoading}
            />
          </div>
          {/* Mic button sends typed text, or starts voice if input is empty */}
          <button
            onClick={inputText.trim() ? handleSendMessage : handleVoiceInput}
            disabled={isLoading}
            className="w-14 h-14 bg-[#7C532F] text-white rounded-full flex items-center justify-center shadow-lg hover:opacity-90 transition-transform active:scale-95 disabled:opacity-50"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
            >
              {inputText.trim() ? "send" : "mic"}
            </span>
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
