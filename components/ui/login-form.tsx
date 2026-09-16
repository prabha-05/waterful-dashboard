"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid username or password");
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.3 }}
      className="w-full max-w-sm"
    >
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        {/* Same asset the sidebar uses, so the brand mark matches across the app. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/waterful-logo.jpg"
          alt="Waterful Zero"
          width={72}
          height={72}
          className="mb-5 h-[72px] w-[72px] rounded-full object-cover shadow-lg shadow-black/40 ring-1 ring-white/10"
        />
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Welcome back
        </h1>
        <p className="mt-2 text-sm text-neutral-400">
          Sign in to your account to continue
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
            Username
          </label>
          <input
            id="email"
            name="email"
            type="text"
            placeholder="username"
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            inputMode="email"
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

        <button
          type="submit"
          disabled={loading}
          className="mt-1 w-full rounded-lg bg-violet-600 px-4 py-3 text-sm font-medium
          text-white transition-all hover:bg-violet-700 active:scale-[0.985]
          shadow-lg shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </motion.div>
  );
}
