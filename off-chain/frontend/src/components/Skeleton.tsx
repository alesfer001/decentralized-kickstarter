"use client";

export function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-zinc-200 dark:bg-zinc-800 rounded ${className}`}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 sm:p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <SkeletonLine className="h-5 w-3/4 mb-2" />
          <SkeletonLine className="h-3 w-1/2" />
        </div>
        <SkeletonLine className="h-6 w-16 rounded-full ml-2" />
      </div>
      <div className="space-y-3">
        <SkeletonLine className="h-3 w-full" />
        <SkeletonLine className="h-3 w-5/6" />
        <div>
          <SkeletonLine className="h-2 w-full rounded-full mt-3" />
        </div>
        <div className="flex justify-between">
          <SkeletonLine className="h-3 w-20" />
          <SkeletonLine className="h-3 w-24" />
        </div>
        <div className="flex justify-between">
          <SkeletonLine className="h-3 w-16" />
          <SkeletonLine className="h-3 w-24" />
        </div>
        <div className="flex justify-between">
          <SkeletonLine className="h-3 w-20" />
          <SkeletonLine className="h-3 w-20" />
        </div>
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <SkeletonLine className="h-3 w-40" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonDetailPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <SkeletonLine className="h-4 w-32 mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left content */}
        <div className="lg:col-span-2 space-y-6">
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <SkeletonLine className="h-7 w-2/3" />
              <SkeletonLine className="h-6 w-20 rounded-full" />
            </div>
            <SkeletonLine className="h-4 w-full mb-2" />
            <SkeletonLine className="h-4 w-4/5 mb-6" />
            <div className="space-y-4">
              <SkeletonLine className="h-3 w-full rounded-full" />
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
                  <SkeletonLine className="h-3 w-16 mb-2" />
                  <SkeletonLine className="h-7 w-24" />
                </div>
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
                  <SkeletonLine className="h-3 w-12 mb-2" />
                  <SkeletonLine className="h-7 w-24" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <SkeletonLine className="h-3 w-24 mb-1" />
                  <SkeletonLine className="h-4 w-20" />
                </div>
                <div>
                  <SkeletonLine className="h-3 w-24 mb-1" />
                  <SkeletonLine className="h-4 w-20" />
                </div>
              </div>
            </div>
          </div>
          {/* Pledges skeleton */}
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
            <SkeletonLine className="h-5 w-32 mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg"
                >
                  <div>
                    <SkeletonLine className="h-4 w-32 mb-1" />
                    <SkeletonLine className="h-3 w-20" />
                  </div>
                  <SkeletonLine className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Right sidebar */}
        <div className="lg:col-span-1">
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
            <SkeletonLine className="h-5 w-32 mb-4" />
            <SkeletonLine className="h-10 w-full mb-4 rounded-lg" />
            <SkeletonLine className="h-11 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
