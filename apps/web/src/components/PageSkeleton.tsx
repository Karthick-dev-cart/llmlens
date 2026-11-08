// Generic Suspense fallback for dashboard pages — a title-bar placeholder
// plus a couple of content-block placeholders, shown for the brief moment
// between navigation and the page's data fetch resolving.
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="h-5 w-32 animate-pulse rounded bg-foreground/10" />
        <div className="h-4 w-48 animate-pulse rounded bg-foreground/5" />
      </div>
      <div className="h-24 animate-pulse rounded-lg border border-foreground/10 bg-foreground/5" />
      <div className="h-48 animate-pulse rounded-lg border border-foreground/10 bg-foreground/5" />
    </div>
  );
}
