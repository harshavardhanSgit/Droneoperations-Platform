"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { MapPicker, type PickedLocation } from "@/components/map-picker";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import { Page } from "@/components/ui/surface";
import { RowsSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/core/api/client";
import type { ProviderDetail, ProviderDocument } from "@/core/api/types";
import { RequireAuth } from "@/core/auth/require-auth";
import { useAuth } from "@/core/auth/auth-context";
import * as providerApi from "@/features/provider/api";
import { StageTracker } from "@/features/provider/stage-tracker";

const DOCUMENT_KINDS = [
  { value: "BUSINESS_REGISTRATION", label: "Business registration" },
  { value: "DRONE_REGISTRATION", label: "Drone registration (UIN)" },
  { value: "PILOT_LICENCE", label: "Remote pilot certificate" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "OTHER", label: "Other" },
];

const EDITABLE = ["REGISTERED", "PROFILE_COMPLETE", "DOCUMENTS_SUBMITTED", "REJECTED"];

function Onboarding() {
  const { account } = useAuth();
  const toast = useToast();

  const [provider, setProvider] = useState<ProviderDetail | null>(null);
  const [documents, setDocuments] = useState<ProviderDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);

  /** Picked on the map — submitted with the profile. */
  const [pickedLocation, setPickedLocation] = useState<PickedLocation | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  /**
   * A map pick fills the address fields in place. The geocoder's names are
   * best-effort, so they stay editable — this only writes them, it does not
   * replace the fields with read-only text.
   */
  const onPickLocation = useCallback((location: PickedLocation) => {
    setPickedLocation(location);
    const form = formRef.current;
    if (!form) return;
    const set = (name: string, value: string | undefined) => {
      const element = form.elements.namedItem(name);
      if (element instanceof HTMLInputElement && value) element.value = value;
    };
    set("addressLine", location.addressLine);
    set("city", location.city);
    set("state", location.state);
    set("pincode", location.pincode);
  }, []);

  const refresh = useCallback(async () => {
    const [detail, docs] = await Promise.all([
      providerApi.getOwnProvider(),
      providerApi.listOwnDocuments(),
    ]);
    setProvider(detail);
    setDocuments(docs);
  }, []);

  // The effect owns its own fetch rather than calling refresh(): every setState
  // then happens inside a promise callback, never synchronously in the effect
  // body. `cancelled` stops a slow response writing to an unmounted component.
  useEffect(() => {
    let cancelled = false;

    Promise.all([providerApi.getOwnProvider(), providerApi.listOwnDocuments()])
      .then(([detail, docs]) => {
        if (cancelled) return;
        setProvider(detail);
        setDocuments(docs);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : "Could not load your application");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function handle(caught: unknown) {
    if (caught instanceof ApiError) {
      setError(caught.message);
      const fields = (caught.details as { fields?: Record<string, string[]> } | undefined)?.fields;
      setFieldErrors(fields ?? {});
    } else {
      setError("Something went wrong");
    }
  }

  async function onSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy("profile");

    const form = new FormData(event.currentTarget);
    const registrationNumber = String(form.get("registrationNumber")).trim();

    try {
      await providerApi.saveProfile({
        legalName: String(form.get("legalName")),
        contactPhone: String(form.get("contactPhone")),
        addressLine: String(form.get("addressLine")),
        city: String(form.get("city")),
        state: String(form.get("state")),
        pincode: String(form.get("pincode")),
        ...(registrationNumber ? { registrationNumber } : {}),
        ...(pickedLocation
          ? { latitude: pickedLocation.latitude, longitude: pickedLocation.longitude }
          : {}),
      });
      await refresh();
      toast("Business details saved");
    } catch (caught) {
      handle(caught);
    } finally {
      setBusy(null);
    }
  }

  async function onUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy("upload");

    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");

    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a file first");
      setBusy(null);
      return;
    }

    try {
      await providerApi.uploadDocument(String(data.get("kind")), file);
      form.reset();
      await refresh();
      toast("Document uploaded");
    } catch (caught) {
      handle(caught);
    } finally {
      setBusy(null);
    }
  }

  async function onSubmit() {
    setError(null);
    setBusy("submit");
    try {
      await providerApi.submitForReview();
      await refresh();
      toast("Submitted — the platform will review your application");
    } catch (caught) {
      handle(caught);
    } finally {
      setBusy(null);
    }
  }

  if (account && account.organisation.kind !== "PROVIDER") {
    return (
      <Page size="form">
        <p className="text-sm text-fg-muted">
          This page is for provider accounts. Your account is a{" "}
          {account.organisation.kind.toLowerCase()}.
        </p>
      </Page>
    );
  }

  if (!provider) {
    return (
      <Page>
        <FormError message={error} />
        {!error ? <RowsSkeleton rows={4} /> : null}
      </Page>
    );
  }

  const editable = EDITABLE.includes(provider.stage);

  return (
    <Page>
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">{provider.organisationName}</h1>
        <p className="mt-1 text-sm text-fg-subtle">Provider onboarding</p>
      </header>

      <section className="mb-8 rounded-surface border border-border p-5">
        <StageTracker stage={provider.stage} />
        {provider.rejectionReason ? (
          <p className="mt-4 text-sm text-danger">
            Reason: {provider.rejectionReason}
          </p>
        ) : null}
        {provider.bookable ? (
          <p className="mt-4 text-sm text-success">
            You are active and can receive bookings.
          </p>
        ) : null}
      </section>

      <FormError message={error} />

      <section className="mt-6 rounded-surface border border-border p-5">
        <h2 className="mb-4 text-sm font-medium">Business details</h2>
        <form ref={formRef} onSubmit={onSaveProfile} className="space-y-4">
          <Field label="Legal name" name="legalName" required defaultValue={provider.legalName ?? ""} disabled={!editable} error={fieldErrors.legalName?.[0]} />
          <Field label="Registration number (optional)" name="registrationNumber" defaultValue={provider.registrationNumber ?? ""} disabled={!editable} error={fieldErrors.registrationNumber?.[0]} />
          <Field label="Contact phone" name="contactPhone" required defaultValue={provider.contactPhone ?? ""} disabled={!editable} error={fieldErrors.contactPhone?.[0]} />

          <div>
            <span className="mb-1.5 block text-sm font-medium">Business location</span>
            <MapPicker
              initial={
                provider.latitude != null && provider.longitude != null
                  ? { latitude: provider.latitude, longitude: provider.longitude }
                  : undefined
              }
              onPick={onPickLocation}
              onClear={() => setPickedLocation(null)}
              disabled={!editable}
            />
          </div>

          <Field label="Address" name="addressLine" required defaultValue={provider.addressLine ?? ""} disabled={!editable} error={fieldErrors.addressLine?.[0]} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="City" name="city" required defaultValue={provider.city ?? ""} disabled={!editable} error={fieldErrors.city?.[0]} />
            <Field label="State" name="state" required defaultValue={provider.state ?? ""} disabled={!editable} error={fieldErrors.state?.[0]} />
            <Field label="PIN code" name="pincode" required defaultValue={provider.pincode ?? ""} disabled={!editable} error={fieldErrors.pincode?.[0]} />
          </div>
          {editable ? <SubmitButton pending={busy === "profile"}>Save details</SubmitButton> : (
            <p className="text-xs text-fg-subtle">
              Details are locked while your application is {provider.stage.toLowerCase().replace("_", " ")}.
            </p>
          )}
        </form>
      </section>

      <section className="mt-6 rounded-surface border border-border p-5">
        <h2 className="mb-4 text-sm font-medium">Documents</h2>

        {documents.length ? (
          <ul className="mb-5 space-y-2">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-4 border-b border-border pb-2 text-sm last:border-0">
                <span className="truncate">
                  {doc.originalFilename}
                  <span className="ml-2 text-fg-subtle">
                    {DOCUMENT_KINDS.find((k) => k.value === doc.kind)?.label ?? doc.kind}
                  </span>
                </span>
                <span className={doc.status === "READY" ? "text-success" : "text-fg-subtle"}>
                  {doc.status === "READY" ? `${(doc.sizeBytes / 1024).toFixed(0)} KB` : "pending"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-5 text-sm text-fg-subtle">No documents uploaded yet.</p>
        )}

        {editable ? (
          <form onSubmit={onUpload} className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Document type</span>
              <select name="kind" defaultValue="BUSINESS_REGISTRATION" className="w-full rounded-md border border-border-strong bg-bg px-3 py-2 text-sm">
                {DOCUMENT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </label>
            <input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-bg file:px-3 file:py-2 file:text-sm" />
            <SubmitButton pending={busy === "upload"}>Upload</SubmitButton>
          </form>
        ) : null}
      </section>

      {provider.stage === "DOCUMENTS_SUBMITTED" ? (
        <section className="mt-6 rounded-surface border border-border p-5">
          <h2 className="mb-2 text-sm font-medium">Ready to submit</h2>
          <p className="mb-4 text-sm text-fg-subtle">
            Your details will be locked while platform staff review your application.
          </p>
          <button
            onClick={() => void onSubmit()}
            disabled={busy === "submit"}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
          >
            {busy === "submit" ? "Submitting…" : "Submit for review"}
          </button>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-medium">History</h2>
        <ol className="space-y-1.5 text-sm">
          {provider.history.map((event, index) => (
            <li key={index} className="flex gap-3 text-fg-muted">
              <span className="tabular-nums text-fg-subtle">
                {new Date(event.at).toLocaleString()}
              </span>
              <span>
                {event.fromStage ? `${event.fromStage} → ` : ""}
                {event.toStage}
                {event.reason ? ` — ${event.reason}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </Page>
  );
}

export default function ProviderOnboardingPage() {
  return (
    <RequireAuth>
      <Onboarding />
    </RequireAuth>
  );
}
