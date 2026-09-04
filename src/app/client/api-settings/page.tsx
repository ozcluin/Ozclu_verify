"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ApiSettingsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/client/verifiers?tab=api");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-xs font-semibold text-slate-500 animate-pulse">Loading API settings...</span>
      </div>
    </div>
  );
}
