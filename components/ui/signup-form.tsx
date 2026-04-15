"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, password }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error);
    } else {
      router.push("/?registered=true");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.3 }}
      className="relative z-10 w-full max-w-md mx-auto px-4"
    >
      <div
        className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 backdrop-blur-xl
        shadow-[0_0_40px_rgba(0,0,0,0.4)]"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-violet-700 shadow-lg shadow-violet-500/20">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              className="text-white"
            >
              <rect x="4" y="6" width="16" height="4" rx="1.5" fill="currentColor" fillOpacity="0.9" />
              <rect x="4" y="12" width="16" height="6" rx="1.5" fill="currentColor" fillOpacity="0.6" />
              <rect x="7" y="14" width="7" height="2" rx="1" fill="currentColor" fillOpacity="0.9" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Create an account
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Sign up to get started
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Form */}
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium text-neutral-400">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-4 py-3 text-sm
              text-white placeholder-white/25 outline-none transition-all
              focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="username" className="text-sm font-medium text-neutral-400">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              placeholder="johndoe"
              required
              className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-4 py-3 text-sm
              text-white placeholder-white/25 outline-none transition-all
              focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-medium text-neutral-400">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
              className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-4 py-3 text-sm
              text-white placeholder-white/25 outline-none transition-all
              focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-neutral-400">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="••••••••"
              required
              className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-4 py-3 text-sm
              text-white placeholder-white/25 outline-none transition-all
              focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-1 w-full rounded-lg bg-violet-600 px-4 py-3 text-sm font-medium
            text-white transition-all hover:bg-violet-700 active:scale-[0.985]
            shadow-lg shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating account..." : "Sign up"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-neutral-400">
          Already have an account?{" "}
          <a href="/" className="text-violet-400 transition-colors hover:text-violet-300">
            Sign in
          </a>
        </p>
      </div>
    </motion.div>
  );
}
