import TopAppBar from '@/components/layout/TopAppBar';
import BottomNav from '@/components/layout/BottomNav';

const medications = [
  { name: 'Atorvastatin', dosage: '20mg • Once daily, evening' },
  { name: 'Lisinopril', dosage: '10mg • Once daily, morning' },
  { name: 'Metformin ER', dosage: '500mg • Twice daily with meals' },
  { name: 'Vitamin D3', dosage: '2000 IU • Once daily' },
];

export default function MyContext() {
  return (
    <div className="bg-surface text-on-surface min-h-screen pb-32">
      <TopAppBar />

      <main className="max-w-screen-xl mx-auto px-8 pt-12">
        <div className="mb-12">
          <h2 className="font-serif text-[3.5rem] leading-tight text-on-surface mb-2">My Context</h2>
          <p className="text-on-surface-variant font-body text-lg max-w-2xl italic">
            Your current medication cabinet and health environment.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
          {/* Medication List */}
          <div className="md:col-span-8">
            <div className="flex flex-col">
              {medications.map((med) => (
                <div
                  key={med.name}
                  className="py-8 flex justify-between items-center border-b border-[#C2C8BF]/20"
                >
                  <div>
                    <h3 className="font-serif text-3xl text-primary mb-1">{med.name}</h3>
                    <p className="font-body text-on-surface-variant text-base">{med.dosage}</p>
                  </div>
                  <span className="material-symbols-outlined text-[#7A8C7B]">chevron_right</span>
                </div>
              ))}
            </div>
            <div className="mt-12">
              <button className="w-full bg-primary hover:bg-primary-container text-white py-5 rounded-xl font-medium text-lg transition-all duration-200 shadow-sm flex items-center justify-center gap-2">
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
                  <circle cx="64" cy="64" fill="transparent" r="58" stroke="#ffdcc2" strokeWidth="12" />
                  <circle
                    cx="64"
                    cy="64"
                    fill="transparent"
                    r="58"
                    stroke="#416448"
                    strokeDasharray="364.4"
                    strokeDashoffset="91.1"
                    strokeWidth="12"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-serif text-3xl">75%</span>
                </div>
              </div>
              <p className="text-center font-body text-sm text-on-surface-variant">
                Consistency this week is looking healthy, Margaret.
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
                <p className="font-serif text-xl text-primary italic">"Small rituals lead to lasting well-being."</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
