"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { User, Mail, Lock, Building2, Phone, ArrowRight } from "lucide-react";
import { signUpClient } from "@/lib/actions";
import { isValidEmail, isValidName, isValidBrandName, isValidPhone } from "@/lib/validation";

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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!isValidName(name)) {
      errors.name = "Enter a valid name (letters only, at least 2 characters).";
    }
    if (!isValidBrandName(brandName)) {
      errors.brandName = "Enter a valid brand/company name (at least 2 characters).";
    }
    if (!isValidEmail(email)) {
      errors.email = "Enter a valid email address.";
    }
    // Phone is optional — only validated if the user actually typed one.
    if (phone.trim() && !isValidPhone(phone)) {
      errors.phone = "Enter a valid 10-digit phone number.";
    }
    if (password.length < 8) {
      errors.password = "Password needs to be at least 8 characters.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setLoading(true);
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
            className={`w-full rounded-xl border bg-slate-800/80 pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none ${
              fieldErrors.name ? "border-rose-500/70 focus:border-rose-500" : "border-slate-700/80 focus:border-indigo-500"
            }`}
            placeholder="Your name"
          />
        </div>
        {fieldErrors.name && <p className="mt-1 text-[11px] font-medium text-rose-400">{fieldErrors.name}</p>}
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-300">Brand / Company Name</label>
        <div className="relative">
          <Building2 className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <input
            type="text"
            required
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            className={`w-full rounded-xl border bg-slate-800/80 pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none ${
              fieldErrors.brandName ? "border-rose-500/70 focus:border-rose-500" : "border-slate-700/80 focus:border-indigo-500"
            }`}
            placeholder="Your brand"
          />
        </div>
        {fieldErrors.brandName && <p className="mt-1 text-[11px] font-medium text-rose-400">{fieldErrors.brandName}</p>}
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
            className={`w-full rounded-xl border bg-slate-800/80 pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none ${
              fieldErrors.email ? "border-rose-500/70 focus:border-rose-500" : "border-slate-700/80 focus:border-indigo-500"
            }`}
            placeholder="you@brand.com"
          />
        </div>
        {fieldErrors.email && <p className="mt-1 text-[11px] font-medium text-rose-400">{fieldErrors.email}</p>}
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-300">Phone Number</label>
        <div className="relative">
          <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <input
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={`w-full rounded-xl border bg-slate-800/80 pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none ${
              fieldErrors.phone ? "border-rose-500/70 focus:border-rose-500" : "border-slate-700/80 focus:border-indigo-500"
            }`}
            placeholder="Optional — 10-digit number"
          />
        </div>
        {fieldErrors.phone && <p className="mt-1 text-[11px] font-medium text-rose-400">{fieldErrors.phone}</p>}
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
            className={`w-full rounded-xl border bg-slate-800/80 pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none ${
              fieldErrors.password ? "border-rose-500/70 focus:border-rose-500" : "border-slate-700/80 focus:border-indigo-500"
            }`}
            placeholder="At least 8 characters"
          />
        </div>
        {fieldErrors.password && <p className="mt-1 text-[11px] font-medium text-rose-400">{fieldErrors.password}</p>}
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
