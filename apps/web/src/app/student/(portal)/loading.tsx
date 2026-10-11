export default function StudentPortalLoading() {
  return (
    <div role="status" aria-label="Loading student workspace" className="space-y-6">
      <span className="sr-only">Loading your student workspace…</span>
      <div aria-hidden="true" className="space-y-3">
        <div className="h-8 w-2/3 rounded bg-muted motion-safe:animate-pulse" />
        <div className="h-4 w-1/2 rounded bg-muted motion-safe:animate-pulse" />
        <div className="h-52 rounded-2xl bg-muted motion-safe:animate-pulse" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-24 rounded-xl bg-muted motion-safe:animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
