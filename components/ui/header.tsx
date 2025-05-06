import { Settings } from 'lucide-react';

interface HeaderProps {
  onSettingsClick?: () => void;
}

export function Header({ onSettingsClick }: HeaderProps) {
  return (
    <header className="flex items-center justify-between h-16 px-6 border-b">
      <span className="text-xl font-semibold">VibeCodeDuo</span>
      <button
        type="button"
        aria-label="Open settings"
        onClick={onSettingsClick}
        className="rounded-full p-2 hover:bg-gray-100 active:bg-gray-200 transition"
      >
        <Settings className="h-6 w-6 text-gray-600" />
      </button>
    </header>
  );
}

export default Header;