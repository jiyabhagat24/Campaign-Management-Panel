import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12 overflow-hidden selection:bg-indigo-500 selection:text-white">
      {/* Ambient background glow circles */}
      <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-600/30 blur-3xl" />
      <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-indigo-400/20 blur-3xl" />

      <div className="relative w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand-logo-badge.png" alt="TheBoredMonkey" className="mx-auto h-28 w-auto object-contain" />
        </div>

        {/* Login Form Container */}
        <LoginForm />
      </div>
    </div>
  );
}
