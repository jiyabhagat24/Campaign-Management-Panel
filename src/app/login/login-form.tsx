"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, ArrowRight, ShieldCheck } from "lucide-react";

type Audience = "TEAM" | "CLIENT";

// Two separate doors, picked via the dropdown below rather than shown
// stacked on top of each other. Internal staff (@theboredmonkey.com)
// normally sign in with Google — access still isn't automatic just from
// having a company Google account, an admin has to have already added them
// as a User with a role first — but can also be given a password (see
// setTeamUserPassword in actions.ts) for cases Google doesn't cover, e.g.
// testing a role. Clients never have a company Google account, so they only
// ever get email + password, plus the self-serve sign-up link. Both
// credentials paths go through the same NextAuth Credentials provider,
// which checks the Client table then the User table (see src/lib/auth.ts).
export default function LoginForm() {
  const router = useRouter();
  const [audience, setAudience] = useState<Audience>("TEAM");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Read the ?error= query param only after mount. Reading window.location
  // directly during render (the old code) made the very first client
  // render disagree with the server-rendered HTML — the server has no
  // concept of the browser's URL — which is exactly what threw React's
  // hydration error #418 in production.
  const [deniedAccess, setDeniedAccess] = useState(false);
  useEffect(() => {
    setDeniedAccess(new URLSearchParams(window.location.search).get("error") === "AccessDenied");
  }, []);

  async function onGoogleSignIn() {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl: "/dashboard" });
  }

  async function onCredentialsSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">I am</span>
        <select
          value={audience}
          onChange={(e) => { setAudience(e.target.value as Audience); setError(null); }}
          className="w-full rounded-xl border border-slate-700/80 bg-slate-800/80 px-3 py-2.5 text-sm font-semibold text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="TEAM">TheBoredMonkey team</option>
          <option value="CLIENT">Client</option>
        </select>
      </label>

      {audience === "TEAM" && (
        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2 text-slate-300">
            <ShieldCheck className="h-4 w-4 text-indigo-400" />
            <p className="text-xs font-semibold">TheBoredMonkey team</p>
          </div>

          {deniedAccess && (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400">
              That Google account isn&apos;t set up in the panel yet, or isn&apos;t on the theboredmonkey.com
              domain. Ask your admin to add you first.
            </p>
          )}

          <button
            type="button"
            onClick={onGoogleSignIn}
            disabled={googleLoading}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-white py-3 text-sm font-bold text-slate-800 shadow-lg transition-all hover:bg-slate-100 active:scale-[0.99] disabled:opacity-60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="h-4 w-4" />
            <span>{googleLoading ? "Redirecting to Google..." : "Sign in with Google"}</span>
          </button>

          <div className="flex items-center gap-3 px-1">
            <div className="h-px flex-1 bg-slate-800" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Or with a password</span>
            <div className="h-px flex-1 bg-slate-800" />
          </div>

          <form onSubmit={onCredentialsSignIn} className="space-y-3">
            <CredentialsFields email={email} setEmail={setEmail} password={password} setPassword={setPassword} emailPlaceholder="you@theboredmonkey.com" />
            {error && <ErrorBanner text={error} />}
            <SubmitButton loading={loading} />
          </form>
        </div>
      )}

      {audience === "CLIENT" && (
        <form
          onSubmit={onCredentialsSignIn}
          className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-md"
        >
          <CredentialsFields email={email} setEmail={setEmail} password={password} setPassword={setPassword} emailPlaceholder="you@brand.com" />
          {error && <ErrorBanner text={error} />}
          <SubmitButton loading={loading} />

          <p className="text-center text-xs text-slate-500">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-semibold text-indigo-400 hover:text-indigo-300">
              Sign up
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}

function CredentialsFields({
  email,
  setEmail,
  password,
  setPassword,
  emailPlaceholder,
}: {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  emailPlaceholder: string;
}) {
  return (
    <>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-300">Email Address</label>
        <div className="relative">
          <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-700/80 bg-slate-800/80 pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            placeholder={emailPlaceholder}
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-300">Password</label>
        <div className="relative">
          <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-700/80 bg-slate-800/80 pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            placeholder="••••••••"
          />
        </div>
      </div>
    </>
  );
}

function ErrorBanner({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400">
      {text}
    </p>
  );
}

function SubmitButton({ loading }: { loading: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/25 transition-all hover:from-indigo-700 hover:to-indigo-800 active:scale-[0.99] disabled:opacity-60"
    >
      <span>{loading ? "Signing in..." : "Sign in"}</span>
      <ArrowRight className="h-4 w-4" />
    </button>
  );
}
