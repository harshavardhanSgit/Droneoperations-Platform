"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Field, FormError, SubmitButton } from "@/components/ui/form";
import { ApiError } from "@/core/api/client";
import { useAuth } from "@/core/auth/auth-context";
import { landingRouteFor } from "@/core/auth/routes";

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);

    try {
      const account = await signIn(String(form.get("email")), String(form.get("password")));
      router.push(landingRouteFor(account.organisation.kind));
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.",
      );
      setPending(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-sm px-6 py-20">
      <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 mb-8 text-sm text-black/50 dark:text-white/50">
        Drone Operations Platform
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <FormError message={error} />
        <Field label="Email" name="email" type="email" required autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
        <SubmitButton pending={pending}>Sign in</SubmitButton>
      </form>

      <p className="mt-6 text-sm text-black/50 dark:text-white/50">
        No account?{" "}
        <Link href="/register" className="underline underline-offset-4">
          Create one
        </Link>
      </p>
    </main>
  );
}
