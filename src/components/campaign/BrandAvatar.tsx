// Kept within the Deep Indigo brand palette (violet/indigo tones, plus the
// dusty-rose warning accent and emerald for variety) instead of the old
// rainbow set — avoids a random campaign avatar landing on an off-palette
// orange/cyan/pink that clashes with the rest of the UI.
const GRADIENTS = [
  "from-indigo-500 to-indigo-700",
  "from-violet-500 to-indigo-600",
  "from-slate-500 to-slate-800",
  "from-indigo-400 to-violet-700",
  "from-emerald-500 to-teal-600",
  "from-amber-400 to-amber-600",
];

function gradientFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

export default function BrandAvatar({
  brand,
  logoUrl,
  size = 40,
}: {
  brand: string;
  logoUrl?: string | null;
  size?: number;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={brand}
        width={size}
        height={size}
        className="rounded-xl border border-slate-200/80 object-cover shadow-xs dark:border-slate-700"
        style={{ width: size, height: size }}
      />
    );
  }

  const initial = brand.trim().charAt(0).toUpperCase() || "?";
  const gradientClass = gradientFor(brand);

  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr ${gradientClass} font-extrabold text-white shadow-xs`}
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {initial}
    </div>
  );
}
