"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Field, FormError, SelectField, SubmitButton } from "@/components/ui/form";
import { ApiError } from "@/core/api/client";
import { useAuth } from "@/core/auth/auth-context";
import { landingRouteFor } from "@/core/auth/routes";
import { register, type AccountType } from "@/features/auth/api";

export default function RegisterPage() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setPending(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const organisationName = String(form.get("organisationName")).trim();

    try {
      await register({
        email,
        password,
        fullName: String(form.get("fullName")),
        accountType: String(form.get("accountType")) as AccountType,
        ...(organisationName ? { organisationName } : {}),
      });

      // Registration does not issue tokens, so sign in immediately afterwards.
      const account = await signIn(email, password);
      router.push(landingRouteFor(account.organisation.kind));
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        // The API returns per-field detail; surface it next to the input.
        const fields = (caught.details as { fields?: Record<string, string[]> } | undefined)
          ?.fields;
        if (fields) setFieldErrors(fields);
      } else {
        setError("Something went wrong. Please try again.");
      }
      setPending(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-sm px-6 py-20">
      <h1 className="text-xl font-semibold tracking-tight">Create an account</h1>
      <p className="mt-1 mb-8 text-sm text-black/50 dark:text-white/50">
        Drone Operations Platform
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <FormError message={error} />

        <Field label="Full name" name="fullName" required error={fieldErrors.fullName?.[0]} />
        <Field
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="email"
          error={fieldErrors.email?.[0]}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          error={fieldErrors.password?.[0]}
        />

        <SelectField label="I am a" name="accountType" defaultValue="CUSTOMER">
          <option value="CUSTOMER">Customer — I need drone services</option>
          <option value="PROVIDER">Provider — I operate drones</option>
        </SelectField>

        <Field
          label="Organisation name (optional)"
          name="organisationName"
          placeholder="Leave blank if registering as an individual"
          error={fieldErrors.organisationName?.[0]}
        />

        <SubmitButton pending={pending}>Create account</SubmitButton>
      </form>

      <p className="mt-6 text-sm text-black/50 dark:text-white/50">
        Already registered?{" "}
        <Link href="/login" className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </main>
  );
}
