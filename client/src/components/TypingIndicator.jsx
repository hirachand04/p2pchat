import { useThemeStore } from '../store/themeStore';

export default function TypingIndicator({ users }) {
  const { isDark } = useThemeStore();
  
  const displayText = users.length === 1
    ? `${users[0]} is typing`
    : users.length === 2
      ? `${users[0]} and ${users[1]} are typing`
      : `${users.length} people are typing`;

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl rounded-bl-md ${
        isDark ? 'bg-dark-card border border-dark-border' : 'bg-white shadow-sm border border-slate-100'
      }`}>
        <div className="flex gap-1">
          <span className={`w-2 h-2 rounded-full typing-dot ${
            isDark ? 'bg-dark-muted' : 'bg-slate-400'
          }`} />
          <span className={`w-2 h-2 rounded-full typing-dot ${
            isDark ? 'bg-dark-muted' : 'bg-slate-400'
          }`} />
          <span className={`w-2 h-2 rounded-full typing-dot ${
            isDark ? 'bg-dark-muted' : 'bg-slate-400'
          }`} />
        </div>
      </div>
      <span className={`text-xs ${isDark ? 'text-dark-muted' : 'text-slate-500'}`}>
        {displayText}
      </span>
    </div>
  );
}
