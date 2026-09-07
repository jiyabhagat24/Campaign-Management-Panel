import Link from "next/link";
import SignupForm from "./signup-form";

export default function SignupPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12 overflow-hidden selection:bg-indigo-500 selection:text-white">
      {/* Ambient background glow circles */}
      <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-600/30 blur-3xl" />
      <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-indigo-400/20 blur-3xl" />

      <div className="relative w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand-logo-badge.png" alt="TheBoredMonkey" className="mx-auto mt-4 h-28 w-auto object-contain" />
        </div>

        <div className="text-center">
          <h1 className="text-lg font-bold text-white">Create your client account</h1>
          <p className="mt-1 text-xs text-slate-400">
            For brands working with TheBoredMonkey — sign up to review shortlists and track campaigns.
          </p>
        </div>

        <SignupForm />

        <p className="text-center text-xs text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-indigo-400 hover:text-indigo-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
