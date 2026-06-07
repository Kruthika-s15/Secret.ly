import { useState } from "react";
import { Lock, Mail, ShieldCheck, User as UserIcon } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import GlowCard from "@/components/layout/GlowCard";
import ShinyButton from "@/components/shared/ShinyButton";
import { supabase } from "@/integrations/supabase/client";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.198 2.698 1.24 6.65l4.026 3.115Z"/>
      <path fill="#34A853" d="M16.04 18.013c-1.09.703-2.474 1.078-4.04 1.078a7.077 7.077 0 0 1-6.723-4.823l-4.04 3.067A11.965 11.965 0 0 0 12 24c2.933 0 5.735-1.043 7.834-3l-3.793-2.987Z"/>
      <path fill="#4A90E2" d="M19.834 21c2.195-2.048 3.62-5.096 3.62-9 0-.71-.109-1.473-.272-2.182H12v4.637h6.436c-.317 1.559-1.17 2.766-2.395 3.558L19.834 21Z"/>
      <path fill="#FBBC05" d="M5.277 14.268A7.12 7.12 0 0 1 4.909 12c0-.782.125-1.533.357-2.235L1.24 6.65A11.934 11.934 0 0 0 0 12c0 1.92.445 3.73 1.237 5.335l4.04-3.067Z"/>
    </svg>
  );
}

const emailSchema = z.string().trim().email("Invalid email address").max(255);
const passwordSignupSchema = z.string().min(8, "Password must be at least 8 characters");
const passwordSigninSchema = z.string().min(1, "Password is required");
const usernameSchema = z.string().trim().min(2, "Min 2 characters").max(32).regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers and _");

export default function AuthPage() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    try { emailSchema.parse(email); } catch (e) { errs.email = e.issues[0].message; }
    try {
      if (mode === "signup") passwordSignupSchema.parse(password);
      else passwordSigninSchema.parse(password);
    } catch (e) { errs.password = e.issues[0].message; }
    if (mode === "signup") {
      try { usernameSchema.parse(username); } catch (e) { errs.username = e.issues[0].message; }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { username: username.trim(), display_name: username.trim() },
          },
        });
        if (error) throw error;
        toast.success("Account created — welcome operator");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        toast.success("Signed in");
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    setGoogleBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err.message);
      setGoogleBusy(false);
    }
  };

  const handleKey = (e) => { if (e.key === "Enter") submit(); };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <GlowCard className="relative z-10 w-full max-w-md animate-fade-in-up">
        <div className="space-y-6 p-2">

          {/* Branding */}
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> STEGANOGRAPHY
          </div>
          <div>
            <h1 className="font-mono text-5xl font-bold leading-none">
              <span className="text-gradient">Secret.ly</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">Hide · Encrypt · Protect</p>
          </div>

          {/* Google button */}
          <button
            onClick={signInWithGoogle}
            disabled={googleBusy}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-border/60 py-3 text-sm font-medium transition hover:bg-white/5 disabled:opacity-50"
          >
            <GoogleIcon />
            {googleBusy ? "Redirecting…" : "Continue with Google"}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border/40" />
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border/40" />
          </div>

          {/* Mode toggle */}
          <div className="inline-flex w-full rounded-xl border border-border/60 bg-card/40 p-1">
            {["signin", "signup"].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setErrors({}); }}
                className={
                  "flex-1 rounded-lg py-2 text-xs font-medium uppercase tracking-widest transition " +
                  (mode === m
                    ? "bg-gradient-primary text-primary-foreground shadow-neon"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          {/* Fields */}
          <div className="space-y-3">
            {mode === "signup" && (
              <div>
                <div className="relative">
                  <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="username"
                    className="w-full rounded-xl border bg-input/60 py-3 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                    style={{ borderColor: errors.username ? "hsl(0 90% 50%)" : "hsl(0 0% 18%)" }}
                  />
                </div>
                {errors.username && <p className="mt-1 text-xs text-muted-foreground">{errors.username}</p>}
              </div>
            )}
            <div>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="agent@secret.io"
                  autoComplete="email"
                  className="w-full rounded-xl border bg-input/60 py-3 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                  style={{ borderColor: errors.email ? "hsl(0 90% 50%)" : "hsl(0 0% 18%)" }}
                />
              </div>
              {errors.email && <p className="mt-1 text-xs text-muted-foreground">{errors.email}</p>}
            </div>
            <div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="••••••••"
                  className="w-full rounded-xl border bg-input/60 py-3 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                  style={{ borderColor: errors.password ? "hsl(0 90% 50%)" : "hsl(0 0% 18%)" }}
                />
              </div>
              {errors.password && <p className="mt-1 text-xs text-muted-foreground">{errors.password}</p>}
            </div>
          </div>

          <ShinyButton size="lg" className="w-full" onClick={submit} disabled={busy}>
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </ShinyButton>

          <p className="text-center text-[11px] text-muted-foreground uppercase tracking-widest">
            SECRET.ly · STEGANOGRAPHY
          </p>
        </div>
      </GlowCard>
    </div>
  );
}