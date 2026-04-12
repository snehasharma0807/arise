import Link from 'next/link';
import { useRouter } from 'next/router';

const navItems = [
  { label: 'My Meds', icon: 'event_note', href: '/' },
  { label: 'My Context', icon: 'folder_open', href: '/my-context' },
  { label: 'Schedule', icon: 'calendar_today', href: '/schedule' },
  { label: 'Interactions', icon: 'science', href: '/interactions' },
];

export default function BottomNav() {
  const router = useRouter();

  return (
    <nav className="fixed bottom-0 w-full z-50 flex justify-around items-center px-4 py-3 bg-[#F7FAF5] dark:bg-emerald-950 border-t border-[#C2C8BF]/20">
      {navItems.map((item) => {
        const isActive = router.pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center transition-colors ${
              isActive
                ? 'text-[#6B8F71] dark:text-emerald-400'
                : 'text-[#7A8C7B] hover:text-[#416448]'
            }`}
          >
            <span
              className="material-symbols-outlined mb-1"
              style={
                isActive
                  ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }
                  : undefined
              }
            >
              {item.icon}
            </span>
            <span className="font-sans text-[0.75rem] uppercase tracking-widest font-medium">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
