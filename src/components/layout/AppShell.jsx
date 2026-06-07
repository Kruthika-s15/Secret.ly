import { Lock, Unlock, Music, Search, ShieldCheck, MessageSquare, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import TextScramble from '@/components/shared/TextScramble';

const TABS = [
  { id: 'image-hide',   label: 'Encrypt',  icon: Lock },
  { id: 'image-reveal', label: 'Decrypt',  icon: Unlock },
  { id: 'audio-hide',   label: 'Audio',    icon: Music },
  { id: 'audio-reveal', label: 'Extract',  icon: Search },
  { id: 'chat',         label: 'Chat',     icon: MessageSquare },
];

export default function AppShell({ activeTab, onTabChange, children }) {
  const { user, signOut } = useAuth();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="pointer-events-none fixed inset-0 grid-bg opacity-20" />
      <div aria-hidden className="pointer-events-none fixed -top-40 left-1/4 h-[500px] w-[500px] rounded-full opacity-20 blur-3xl animate-float-orb"
        style={{ background: 'radial-gradient(circle, hsl(0 0% 100% / 0.12), transparent 70%)' }} />
      <div aria-hidden className="pointer-events-none fixed -bottom-40 right-1/4 h-[500px] w-[500px] rounded-full opacity-15 blur-3xl animate-float-orb"
        style={{ background: 'radial-gradient(circle, hsl(0 0% 100% / 0.10), transparent 70%)', animationDelay: '-7s' }} />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">

        <header className="flex flex-wrap items-center justify-between gap-4 pb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary shadow-neon">
              <ShieldCheck className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold leading-none sm:text-4xl">
                <TextScramble text="Secret.ly" className="text-gradient" loopDelay={6000} />
              </h1>
              <p className="mt-1 text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Hide · Encrypt · Protect
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-3 text-xs text-muted-foreground">
            {user && (
              <span className="hidden items-center gap-1.5 rounded-full border border-border/60 bg-card/40 px-3 py-1.5 sm:inline-flex">
                {user.email}
              </span>
            )}
            <button onClick={signOut}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/40 px-3 py-1.5 hover:text-primary transition-colors">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </nav>
        </header>

        <div className="mb-6 inline-flex rounded-xl border border-border/60 bg-card/40 p-1 backdrop-blur flex-wrap gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={cn(
                'relative inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-all duration-200',
                activeTab === id
                  ? 'bg-gradient-primary text-primary-foreground shadow-neon'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="animate-fade-in-up">
          {children}
        </div>

        <footer className="mt-12 border-t border-border/40 pt-6 text-center text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          SECRET.ly · STEGANOGRAPHY REDEFINED
        </footer>
      </div>
    </div>
  );
}