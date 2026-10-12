import { useState } from "react";
import TopAppBar from "@/components/layout/TopAppBar";
import BottomNav from "@/components/layout/BottomNav";
import { useMedications } from "@/context/MedicationsContext";
import type { ScannedMedication } from "@/context/MedicationsContext";
import { USER_FIRST_NAME } from "@/lib/user";

// ── Add Medication Modal ───────────────────────────────────────────────────

function AddMedicationModal({ onClose }: { onClose: () => void }) {
  const { addManualMedication } = useMedications();
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [form, setForm] = useState("tablet");
  const [scheduledTime, setScheduledTime] = useState("08:00 AM");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Medication name is required."); return; }
    if (!dosage.trim()) { setError("Dosage is required."); return; }
    addManualMedication({ name: name.trim(), dosage: dosage.trim(), form, scheduledTime });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="bg-surface w-full max-w-md rounded-t-2xl sm:rounded-2xl p-8 space-y-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-2xl text-on-surface">Add Medication</h3>
          <button onClick={onClose} className="text-outline hover:text-on-surface">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[0.65rem] uppercase tracking-widest text-outline mb-1">Medication Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lisinopril"
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline/40 focus:outline-none focus:border-primary text-base"
            />
          </div>

          <div>
            <label className="block text-[0.65rem] uppercase tracking-widest text-outline mb-1">Dosage</label>
            <input
              type="text"
              value={dosage}
              onChange={(e) => setDosage(e.target.value)}
              placeholder="e.g. 10mg"
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline/40 focus:outline-none focus:border-primary text-base"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[0.65rem] uppercase tracking-widest text-outline mb-1">Form</label>
              <select
                value={form}
                onChange={(e) => setForm(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary text-base"
              >
                <option value="tablet">Tablet</option>
                <option value="capsule">Capsule</option>
                <option value="liquid">Liquid</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-[0.65rem] uppercase tracking-widest text-outline mb-1">Time</label>
              <select
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary text-base"
              >
                <option value="08:00 AM">Morning (8 AM)</option>
                <option value="12:30 PM">Midday (12:30 PM)</option>
                <option value="07:00 PM">Evening (7 PM)</option>
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-error">{error}</p>}

          <button
            type="submit"
            className="w-full bg-primary hover:bg-primary/90 text-white py-4 rounded-xl font-medium text-base transition-colors"
          >
            Add to My Meds
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Hardcoded placeholder medications (shown when no scans yet) ─────────────

const PLACEHOLDER_MEDS = [
  { name: "Atorvastatin", dosage: "20mg • Once daily, evening" },
  { name: "Lisinopril", dosage: "10mg • Once daily, morning" },
  { name: "Metformin ER", dosage: "500mg • Twice daily with meals" },
  { name: "Vitamin D3", dosage: "2000 IU • Once daily" },
];

// ── Expanded detail panel ──────────────────────────────────────────────────

function MedicationDetail({ med }: { med: ScannedMedication }) {
  return (
    <div className="px-6 pb-6 pt-2 space-y-3 bg-surface-container-low border-t border-[#C2C8BF]/20">
      {med.purpose && (
        <div>
          <span className="block text-[0.6rem] uppercase tracking-widest text-outline mb-0.5">
            Purpose
          </span>
          <p className="text-sm text-on-surface leading-relaxed">{med.purpose}</p>
        </div>
      )}
      {med.howToTake && (
        <div>
          <span className="block text-[0.6rem] uppercase tracking-widest text-outline mb-0.5">
            How to take
          </span>
          <p className="text-sm text-on-surface leading-relaxed">{med.howToTake}</p>
        </div>
      )}
      {med.keyWarning && (
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-tertiary text-sm mt-0.5 shrink-0">warning</span>
          <p className="text-sm text-tertiary leading-relaxed">{med.keyWarning}</p>
        </div>
      )}
      <p className="text-[0.65rem] text-outline italic">
        Scanned with Arise — {med.scheduledTime}
      </p>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function MyContext() {
  const { medications, removeMedication } = useMedications();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  // Show scanned medications at top, then placeholders if nothing scanned yet
  const showPlaceholders = medications.length === 0;

  // Cabinet status — progress based on scanned meds (or static 75% for placeholders)
  const totalMeds = showPlaceholders ? 4 : medications.length;
  const checkedMeds = showPlaceholders ? 3 : medications.filter((m) => m.checked).length;
  const pct = totalMeds > 0 ? Math.round((checkedMeds / totalMeds) * 100) : 0;
  const circumference = 364.4;
  const dashOffset = circumference - (circumference * pct) / 100;

  return (
    <div className="bg-surface text-on-surface min-h-screen pb-32">
      <TopAppBar />

      <main className="max-w-screen-xl mx-auto px-8 pt-12">
        <div className="mb-12">
          <h2 className="font-serif text-[3.5rem] leading-tight text-on-surface mb-2">
            My Context
          </h2>
          <p className="text-on-surface-variant font-body text-lg max-w-2xl italic">
            Your current medication cabinet and health environment.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
          {/* Medication List */}
          <div className="md:col-span-8">
            <div className="flex flex-col">
              {/* Scanned medications */}
              {medications.map((med) => {
                const isExpanded = expandedId === med.id;
                return (
                  <div
                    key={med.id}
                    className="border-b border-[#C2C8BF]/20"
                  >
                    <div className="flex items-center">
                      <button
                        onClick={() => toggleExpand(med.id)}
                        className="flex-1 py-8 flex justify-between items-center text-left hover:bg-surface-container-low/50 transition-colors px-1"
                      >
                        <div>
                          <h3 className="font-serif text-3xl text-primary mb-1">
                            {med.name}
                          </h3>
                          <p className="font-body text-on-surface-variant text-base">
                            {med.dosage} • {med.form}
                          </p>
                        </div>
                        <span
                          className="material-symbols-outlined text-[#7A8C7B] transition-transform duration-200"
                          style={{ transform: isExpanded ? "rotate(90deg)" : "none" }}
                        >
                          chevron_right
                        </span>
                      </button>
                      <button
                        onClick={() => removeMedication(med.id)}
                        className="ml-3 p-2 rounded-lg text-outline hover:text-error hover:bg-error/10 transition-colors shrink-0"
                        aria-label={`Remove ${med.name}`}
                      >
                        <span className="material-symbols-outlined text-[20px]">delete</span>
                      </button>
                    </div>
                    {isExpanded && <MedicationDetail med={med} />}
                  </div>
                );
              })}

              {/* Placeholder medications (shown when nothing scanned yet) */}
              {showPlaceholders &&
                PLACEHOLDER_MEDS.map((med) => (
                  <div
                    key={med.name}
                    className="py-8 flex justify-between items-center border-b border-[#C2C8BF]/20"
                  >
                    <div>
                      <h3 className="font-serif text-3xl text-primary mb-1">
                        {med.name}
                      </h3>
                      <p className="font-body text-on-surface-variant text-base">
                        {med.dosage}
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-[#C2C8BF]">
                      chevron_right
                    </span>
                  </div>
                ))}

              {/* Empty state */}
              {!showPlaceholders && medications.length > 0 && (
                <p className="py-6 text-sm text-outline italic">
                  Scan more medications on the My Meds tab to add them here.
                </p>
              )}
            </div>

            <div className="mt-12">
              <button
                onClick={() => setShowAddModal(true)}
                className="w-full bg-primary hover:bg-primary/90 text-white py-5 rounded-xl font-medium text-lg transition-all duration-200 shadow-sm flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined">add</span>
                Add Medication
              </button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="md:col-span-4 space-y-12">
            <div className="bg-surface-container-low p-8 rounded-xl">
              <h4 className="font-label text-[0.75rem] uppercase tracking-widest font-medium text-[#7A8C7B] mb-6">
                Cabinet Status
              </h4>
              <div className="relative w-32 h-32 mx-auto mb-6">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="64" cy="64" fill="transparent" r="58"
                    stroke="#ffdcc2" strokeWidth="12"
                  />
                  <circle
                    cx="64" cy="64" fill="transparent" r="58"
                    stroke="#416448"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    strokeWidth="12"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-serif text-3xl">
                    {showPlaceholders ? "75%" : `${pct}%`}
                  </span>
                </div>
              </div>
              <p className="text-center font-body text-sm text-on-surface-variant">
                {showPlaceholders
                  ? `Consistency this week is looking healthy, ${USER_FIRST_NAME}.`
                  : `${checkedMeds} of ${totalMeds} taken today.`}
              </p>
            </div>

            <div className="relative overflow-hidden rounded-xl h-64 group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="Calm organized bathroom shelf with wooden textures and soft ambient light"
                className="absolute inset-0 w-full h-full object-cover grayscale opacity-40 transition-transform duration-500 group-hover:scale-105"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuC3XJy-Pv2sVmRVK8XqicBdbBvd8OUdJT8qP3If0wSBM92JCxxkyqU2ud3UyOu1jck8fb_k1xZpaYEZBetqih8hcGMwsFb_Jj5l47fNd5sMDLPuh35bJZW-clmMZxNYJBmGHzQ-dIg1PsFVzGXMV4zEdmv-SkO2V6KpFrDh0v1LToc6lF7rrmXn9i450O_nUKkmbfM-SbWOqUDcHxl2J_7QPMuuD61hzoQpzUxFdXrYI80y-TLvI1YTG9sJyAl_3dEjWiUupKkogc8R"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-surface-container-low to-transparent" />
              <div className="absolute bottom-6 left-6 right-6">
                <p className="font-serif text-xl text-primary italic">
                  "Small rituals lead to lasting well-being."
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <BottomNav />
      {showAddModal && <AddMedicationModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
