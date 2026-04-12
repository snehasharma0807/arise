import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { PipelineResponse } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ScannedMedication {
  id: string;
  name: string;
  dosage: string;
  form: string;
  scheduledTime: string; // e.g. "08:00 AM"
  checked: boolean;
  // Caregiver card fields — populated from pipeline scan
  purpose?: string;
  howToTake?: string;
  keyWarning?: string;
}

export interface ManualMedicationInput {
  name: string;
  dosage: string;
  form: string;
  scheduledTime: string;
}

interface MedicationsContextType {
  medications: ScannedMedication[];
  addMedication: (result: PipelineResponse) => void;
  addManualMedication: (input: ManualMedicationInput) => void;
  toggleChecked: (id: string) => void;
  removeMedication: (id: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "arise_medications";

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** Pick a reasonable default scheduled time based on current hour. */
function defaultScheduledTime(): string {
  const h = new Date().getHours();
  if (h < 12) return "08:00 AM";
  if (h < 17) return "12:30 PM";
  return "07:00 PM";
}

// ── Context ────────────────────────────────────────────────────────────────

const MedicationsContext = createContext<MedicationsContextType | null>(null);

export function MedicationsProvider({ children }: { children: ReactNode }) {
  const [medications, setMedications] = useState<ScannedMedication[]>([]);

  // Hydrate from localStorage once on mount (avoids SSR mismatch)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setMedications(JSON.parse(stored) as ScannedMedication[]);
    } catch {
      // Corrupt storage — start fresh
    }
  }, []);

  // Persist whenever the list changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(medications));
  }, [medications]);

  const addMedication = useCallback((result: PipelineResponse) => {
    const { extraction, analysis } = result;

    setMedications((prev) => {
      // Skip duplicates (case-insensitive name match)
      const exists = prev.some(
        (m) =>
          m.name.toLowerCase() === extraction.medication_name.toLowerCase()
      );
      if (exists) return prev;

      const newMed: ScannedMedication = {
        id: makeId(),
        name: extraction.medication_name,
        dosage: extraction.dosage,
        form: extraction.form,
        scheduledTime: defaultScheduledTime(),
        checked: false,
        purpose: analysis.caregiver_card.purpose,
        howToTake: analysis.caregiver_card.how_to_take,
        keyWarning: analysis.caregiver_card.key_warning,
      };

      return [newMed, ...prev];
    });
  }, []);

  const addManualMedication = useCallback((input: ManualMedicationInput) => {
    setMedications((prev) => {
      const exists = prev.some(
        (m) => m.name.toLowerCase() === input.name.toLowerCase()
      );
      if (exists) return prev;

      const newMed: ScannedMedication = {
        id: makeId(),
        name: input.name,
        dosage: input.dosage,
        form: input.form,
        scheduledTime: input.scheduledTime,
        checked: false,
      };

      return [newMed, ...prev];
    });
  }, []);

  const toggleChecked = useCallback((id: string) => {
    setMedications((prev) =>
      prev.map((m) => (m.id === id ? { ...m, checked: !m.checked } : m))
    );
  }, []);

  const removeMedication = useCallback((id: string) => {
    setMedications((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return (
    <MedicationsContext.Provider value={{ medications, addMedication, addManualMedication, toggleChecked, removeMedication }}>
      {children}
    </MedicationsContext.Provider>
  );
}

export function useMedications() {
  const ctx = useContext(MedicationsContext);
  if (!ctx)
    throw new Error("useMedications must be used inside MedicationsProvider");
  return ctx;
}
