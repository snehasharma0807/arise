export default function TopAppBar() {
  return (
    <header className="bg-[#F7FAF5] dark:bg-emerald-950/20 sticky top-0 z-40 w-full">
      <div className="flex items-end px-8 pt-16 pb-6 w-full max-w-screen-xl mx-auto">
        <div className="flex items-center gap-4">
          <span className="material-symbols-outlined text-[#416448] dark:text-emerald-400 text-3xl">spa</span>
          <h1 className="font-serif text-[1.75rem] leading-tight tracking-tight text-[#416448] dark:text-emerald-400">
            Good morning, Margaret 🌿
          </h1>
        </div>
      </div>
    </header>
  );
}
