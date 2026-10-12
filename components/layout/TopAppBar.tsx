import { useEffect, useState } from "react";
import { USER_FIRST_NAME } from "@/lib/user";

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function TopAppBar() {
  // Computed after mount so server and client render the same markup.
  const [greeting, setGreeting] = useState("Hello");

  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  return (
    <header className="bg-[#F7FAF5] dark:bg-emerald-950/20 sticky top-0 z-40 w-full">
      <div className="flex items-end px-8 pt-16 pb-6 w-full max-w-screen-xl mx-auto">
        <div className="flex items-center gap-4">
          <span className="material-symbols-outlined text-[#416448] dark:text-emerald-400 text-3xl">spa</span>
          <h1 className="font-serif text-[1.75rem] leading-tight tracking-tight text-[#416448] dark:text-emerald-400">
            {greeting}, {USER_FIRST_NAME} 🚀
          </h1>
        </div>
      </div>
    </header>
  );
}
