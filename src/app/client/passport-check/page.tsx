"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PassportCheckRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/client/identity-verification?service=passport");
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <div className="w-8 h-8 border-2 border-slate-800 border-t-transparent rounded-full animate-spin"></div>
      <span className="text-xs font-semibold text-slate-500">Redirecting to Services...</span>
    </div>
  );
}
