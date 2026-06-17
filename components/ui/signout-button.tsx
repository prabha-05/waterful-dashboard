"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded-lg bg-white/[0.05] border border-white/10 px-6 py-3 text-sm font-medium
      text-white transition-all hover:bg-white/10 active:scale-[0.985]"
    >
      Sign out
    </button>
  );
}
