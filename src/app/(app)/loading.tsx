// Next.js shows this automatically the instant you click a link to any
// page under the (app) group, while that page's server component is still
// fetching its data — without this file, navigation shows nothing at all
// until the entire next page's data is ready, which is what was making
// every page change feel slow. This is pure perceived-speed: it doesn't
// change how long a page takes to load, just gives instant feedback that
// something is happening instead of a blank/frozen screen.
export default function AppLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-panel dark:bg-slate-950">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-indigo-600 dark:border-slate-800 dark:border-t-indigo-500" />
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500">Loading…</p>
      </div>
    </div>
  );
}
