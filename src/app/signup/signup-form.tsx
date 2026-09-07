"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { User, Mail, Lock, Building2, Phone, ArrowRight } from "lucide-react";
import { signUpClient } from "@/lib/actions";

// Self-serve client sign-up — instant account creation (no CXO approval
// step): submitting this form creates the real Client login row right away
// via signUpClient(), then immediately signs them in with the same
// credentials so there's no separate "now go log in" step. It does NOT
// grant access to any campaign — that's still a CXO assigning
// CampaignClientAccess afterward, same as a client account created by hand
// on the Team page. brandName/phone are captured for that follow-up (see
// the ClientSignup model's comment in schema.prisma).
export default function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [brandName, setBrandName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signUpClient({ name, email, password, brandName, phone });
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        // Account was created but the immediate sign-in call failed for some
        // reason — send them to the login screen instead of stalling here.
        router.push("/login");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-md"
    >
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-300">Full Name</label>
        <div className="relative">
          <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-slate-700/80 bg-slate-800/80 pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            placeholder="Your name"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-300">Brand / Company Name</label>
        <div className="relative">
          <Building2 className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            className="w-full rounded-xl border border-slate-700/80 bg-slate-800/80 pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            placeholder="Your brand"
          />
        </div>
      </div>

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
            placeholder="you@brand.com"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-300">Phone Number</label>
        <div className="relative">
          <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-slate-700/80 bg-slate-800/80 pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            placeholder="Optional"
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
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-700/80 bg-slate-800/80 pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            placeholder="At least 8 characters"
          />
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/25 transition-all hover:from-indigo-700 hover:to-indigo-800 active:scale-[0.99] disabled:opacity-60"
      >
        <span>{loading ? "Creating account..." : "Create account"}</span>
        <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  );
}
