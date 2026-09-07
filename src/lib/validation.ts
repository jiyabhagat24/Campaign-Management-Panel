// Shared field-format validators — used by both the client sign-up form
// (src/app/signup/signup-form.tsx, for instant inline feedback) and the
// signUpClient server action (src/lib/actions.ts, so a request that skips
// the browser form can't bypass these). Keep both sides pointed at the same
// regex rather than letting them drift.

// Deliberately simple (not the full RFC 5322 grammar) — just enough to
// reject obviously-malformed input like "abc" or "a@b" while not rejecting
// real addresses with pluses, dots, subdomains etc.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Indian 10-digit mobile numbers, digits only — matches the "10 digits"
// requirement directly. Any spaces/dashes/parens/country code the user
// typed are stripped before this check runs (see normalizePhone).
export const PHONE_REGEX = /^\d{10}$/;

// A person's name: starts with a letter, 2-80 chars, letters/spaces/
// apostrophes/hyphens/periods only (covers "Jiya Bhagat", "D'Souza", "A. K. Roy").
export const NAME_REGEX = /^[A-Za-z][A-Za-z .'-]{1,79}$/;

// A brand/company name: starts with a letter or digit, 2-80 chars, allows
// the usual punctuation brand names use ("Nike", "Dunzo Pvt. Ltd.", "H&M").
export const BRAND_NAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9 &.,'-]{1,79}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

// Strips everything but digits, then also drops a leading "91"/"0" country/
// trunk prefix if that leaves exactly 10 digits behind — so "+91 98765
// 43210" and "098765 43210" both validate the same as "9876543210".
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export function isValidPhone(phone: string): boolean {
  return PHONE_REGEX.test(normalizePhone(phone));
}

export function isValidName(name: string): boolean {
  return NAME_REGEX.test(name.trim());
}

export function isValidBrandName(name: string): boolean {
  return BRAND_NAME_REGEX.test(name.trim());
}
