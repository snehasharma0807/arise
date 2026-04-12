import { useState } from "react";
import TopAppBar from "@/components/layout/TopAppBar";
import BottomNav from "@/components/layout/BottomNav";
import { useMedications } from "@/context/MedicationsContext";

const WEEK_DAYS = [
  { day: "Mon", date: "12" },
  { day: "Tue", date: "13" },
  { day: "Wed", date: "14" },
  { day: "Thu", date: "15" },
  { day: "Fri", date: "16" },
  { day: "Sat", date: "17" },
  { day: "Sun", date: "18" },
];

export default function Schedule() {
  const [activeDayIndex, setActiveDayIndex] = useState(2);
  const [reminders, setReminders] = useState(true);
  const [sound, setSound] = useState(true);
  const [vibration, setVibration] = useState(false);

  const { medications, toggleChecked } = useMedications();

  return (
    <div className="bg-[#f7faf5] text-[#191c1a] min-h-screen pb-24">
      <TopAppBar />

      <main className="max-w-screen-xl mx-auto px-8 space-y-12">
        {/* Week Strip */}
        <section className="mt-8">
          <div className="flex justify-between gap-3">
            {WEEK_DAYS.map((d, i) => {
              const isActive = i === activeDayIndex;
              return (
                <button
                  key={d.day}
                  onClick={() => setActiveDayIndex(i)}
                  className={`flex-1 flex flex-col items-center justify-center h-20 rounded-[4px] transition-colors ${
                    isActive
                      ? "bg-[#6B8F71] text-white shadow-md"
                      : "bg-surface-container-low border border-outline-variant/10 hover:bg-surface-container"
                  }`}
                >
                  <span className={`font-label text-[0.65rem] uppercase tracking-widest mb-1 ${isActive ? "opacity-80" : "text-on-surface-variant"}`}>
                    {d.day}
                  </span>
                  <span className={`font-body text-lg ${isActive ? "font-bold" : "font-semibold"}`}>
                    {d.date}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Daily Rituals Timeline */}
        <section className="space-y-6">
          <h2 className="font-headline text-2xl text-primary">Daily Rituals</h2>

          {medications.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-center">
              <span className="material-symbols-outlined text-4xl text-outline-variant">medication</span>
              <p className="text-on-surface-variant text-sm max-w-xs leading-relaxed">
                No medications yet. Scan a pill bottle on My Meds or add one manually in My Context.
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {medications.map((med) => (
                <button
                  key={med.id}
                  onClick={() => toggleChecked(med.id)}
                  className="w-full h-[72px] flex items-center justify-between border-b border-outline-variant/20 px-2 hover:bg-surface-container-low transition-colors duration-200 text-left"
                >
                  <div className="flex flex-col">
                    <span className="text-[17px] font-medium text-on-surface">{med.name}</span>
                    <span className="text-[13px] text-on-surface-variant">
                      {med.scheduledTime} • {med.dosage} {med.form}
                    </span>
                  </div>
                  <div className={`w-6 h-6 border-[1.5px] rounded-[4px] flex items-center justify-center transition-all ${med.checked ? "border-primary bg-primary-container/10" : "border-outline/30"}`}>
                    {med.checked && (
                      <span
                        className="material-symbols-outlined text-[16px] text-primary"
                        style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                      >
                        check
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Schedule Preferences */}
        <section className="space-y-6 pt-4">
          <h3 className="font-label text-[0.75rem] uppercase tracking-[0.2em] text-outline">Schedule Preferences</h3>
          <div className="space-y-3">
            <div className="h-14 flex items-center justify-between px-6 bg-surface-container-low rounded-xl">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-primary">notifications</span>
                <span className="font-body font-medium text-on-surface">Reminders</span>
              </div>
              <button onClick={() => setReminders((v) => !v)} className={`w-12 h-6 rounded-full relative flex items-center px-1 transition-colors ${reminders ? "bg-primary" : "bg-outline-variant/30"}`} aria-pressed={reminders} aria-label="Toggle reminders">
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${reminders ? "translate-x-6" : "translate-x-0"}`} />
              </button>
            </div>
            <div className="h-14 flex items-center justify-between px-6 bg-surface-container-low rounded-xl">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-primary">schedule</span>
                <span className="font-body font-medium text-on-surface">Alert Time</span>
              </div>
              <span className="text-sm font-semibold text-primary">15 min prior</span>
            </div>
            <div className="h-14 flex items-center justify-between px-6 bg-surface-container-low rounded-xl">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-primary">volume_up</span>
                <span className="font-body font-medium text-on-surface">Sound</span>
              </div>
              <button onClick={() => setSound((v) => !v)} className={`w-12 h-6 rounded-full relative flex items-center px-1 transition-colors ${sound ? "bg-primary" : "bg-outline-variant/30"}`} aria-pressed={sound} aria-label="Toggle sound">
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${sound ? "translate-x-6" : "translate-x-0"}`} />
              </button>
            </div>
            <div className="h-14 flex items-center justify-between px-6 bg-surface-container-low rounded-xl">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-primary">vibration</span>
                <span className="font-body font-medium text-on-surface">Vibration</span>
              </div>
              <button onClick={() => setVibration((v) => !v)} className={`w-12 h-6 rounded-full relative flex items-center px-1 transition-colors ${vibration ? "bg-primary" : "bg-outline-variant/30"}`} aria-pressed={vibration} aria-label="Toggle vibration">
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${vibration ? "translate-x-6" : "translate-x-0"}`} />
              </button>
            </div>
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
