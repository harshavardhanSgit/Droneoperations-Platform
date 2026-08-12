"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { MapPicker } from "@/components/map-picker";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/form";
import { Page, PageHeader, Surface } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/core/api/client";
import type { Area } from "@/core/api/types";
import { useAuth } from "@/core/auth/auth-context";
import { RequireAuth } from "@/core/auth/require-auth";
import { useTheme } from "@/core/theme/theme-context";
import type { Theme } from "@/core/theme/theme";
import * as authApi from "@/features/auth/api";
import * as customerApi from "@/features/auth/customer-api";
import * as catalogueApi from "@/features/catalogue/api";
import { resolveAreaFromPin } from "@/features/catalogue/resolve-area";
import * as organisationApi from "@/features/auth/organisation-api";

const THEMES: { value: Theme; label: string; hint: string }[] = [
  { value: "light", label: "Light", hint: "Always light" },
  { value: "dark", label: "Dark", hint: "Always dark" },
  { value: "system", label: "System", hint: "Follow your device" },
];

/** A titled block. Sections are siblings, not nested cards. */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Surface as="section" className="p-5">
      <h2 className="text-sm font-medium">{title}</h2>
      {description ? <p className="mt-1 text-xs text-fg-subtle">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </Surface>
  );
}

function Account() {
  const { account, setAccount, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const router = useRouter();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(account?.fullName ?? "");
  const [phone, setPhone] = useState(account?.phone ?? "");
  const [orgName, setOrgName] = useState(account?.organisation.name ?? "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // The customer's saved default field. Loaded lazily — providers and staff
  // never render this section, so they never make the request.
  const [fieldPoint, setFieldPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [fieldLabel, setFieldLabel] = useState("");
  // Resolved from the pin so a saved field can pre-fill a booking's district.
  const [fieldAreaId, setFieldAreaId] = useState<string | null>(null);
  // Top-level areas, needed to turn a geocoded state name into a catalogue id.
  const [states, setStates] = useState<Area[]>([]);

  const isCustomer = account?.organisation.kind === "CUSTOMER";

  useEffect(() => {
    if (!isCustomer) return;
    let cancelled = false;

    customerApi
      .getOwnCustomerProfile()
      .then((profile) => {
        if (cancelled) return;
        if (profile.latitude !== undefined && profile.longitude !== undefined) {
          setFieldPoint({ latitude: profile.latitude, longitude: profile.longitude });
        }
        setFieldLabel(profile.locationLabel ?? "");
        setFieldAreaId(profile.defaultAreaId ?? null);
      })
      .catch(() => {
        // A profile that will not load must not break the rest of the page —
        // everything else here is independent of it.
      });

    catalogueApi
      .listAreas()
      .then((topLevel) => {
        if (!cancelled) setStates(topLevel);
      })
      .catch(() => {
        // Without states a pin cannot be resolved to a district — the pin
        // itself still saves, which is the part that matters most.
      });

    return () => {
      cancelled = true;
    };
  }, [isCustomer]);

  if (!account) return null;

  const isOwner = account.role === "OWNER";

  const fail = (caught: unknown, fallback: string) =>
    setError(caught instanceof ApiError ? caught.message : fallback);

  async function onSaveProfile(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy("profile");

    try {
      // Phone is sent even when blank — "" is how the API is told to clear it,
      // and omitting the key would mean "leave it alone", making a number
      // impossible to remove once added.
      const updated = await authApi.updateAccount({ fullName: fullName.trim(), phone: phone.trim() });
      setAccount(updated);
      toast("Profile saved");
    } catch (caught) {
      fail(caught, "Could not save your profile");
    } finally {
      setBusy(null);
    }
  }

  async function onRenameOrganisation(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy("organisation");

    try {
      const updated = await organisationApi.renameOwnOrganisation(orgName.trim());
      // The sidebar footer shows this name, so the context has to hear about it.
      setAccount({ ...account!, organisation: { ...account!.organisation, name: updated.name } });
      toast("Organisation renamed");
    } catch (caught) {
      fail(caught, "Could not rename your organisation");
    } finally {
      setBusy(null);
    }
  }

  async function onSaveField(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy("field");

    try {
      await customerApi.saveOwnCustomerProfile({
        // null, not undefined: the customer may have cleared the pin, and the
        // API reads undefined as "leave it alone" — which would silently keep
        // a point they just removed.
        latitude: fieldPoint?.latitude ?? null,
        longitude: fieldPoint?.longitude ?? null,
        locationLabel: fieldLabel.trim() || null,
        defaultAreaId: fieldAreaId,
      });
      toast("Default field saved");
    } catch (caught) {
      fail(caught, "Could not save your default field");
    } finally {
      setBusy(null);
    }
  }

  async function onClearField() {
    setError(null);
    setBusy("field");

    try {
      await customerApi.saveOwnCustomerProfile({
        latitude: null,
        longitude: null,
        locationLabel: null,
        defaultAreaId: null,
      });
      setFieldPoint(null);
      setFieldLabel("");
      setFieldAreaId(null);
      toast("Default field cleared");
    } catch (caught) {
      fail(caught, "Could not clear your default field");
    } finally {
      setBusy(null);
    }
  }

  async function onChangePassword(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // Checked here as well as on the server: a typo in the confirmation is not
    // worth a round trip, and the server never sees this field anyway.
    if (newPassword !== confirmPassword) {
      setError("The two new passwords do not match");
      return;
    }

    setBusy("password");

    try {
      await authApi.changePassword(currentPassword, newPassword);
      toast("Password changed — please sign in again");

      // signOut(), not just a redirect. The server revoked every refresh
      // token, but this tab still holds a VALID access token in memory — a JWT
      // cannot be revoked — so the app would go on believing it is signed in
      // and bounce straight back out of /login. Clearing the local session is
      // what makes the two agree.
      await signOut();
      router.push("/login");
    } catch (caught) {
      fail(caught, "Could not change your password");
      setBusy(null);
    }
  }

  return (
    <Page size="form">
      <PageHeader title="Account" description="Your details, your organisation and how this looks." />

      <FormError message={error} />

      <div className="mt-4 space-y-4">
        <Section
          title="Profile"
          description="Your email is how you sign in, so it cannot be changed here."
        >
          <form onSubmit={onSaveProfile} className="space-y-4">
            <Field
              label="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              minLength={2}
              maxLength={120}
            />
            <Field
              label="Phone (optional)"
              type="tel"
              inputMode="tel"
              placeholder="+91 98765 43210"
              hint="Shown to the other party once a booking is accepted. Clear it to remove it."
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <div>
              <span className="mb-1.5 block text-sm font-medium">Email</span>
              <p className="tabular flex h-11 items-center rounded-control border border-border bg-bg-sunken px-3 text-[15px] text-fg-muted">
                {account.email}
              </p>
            </div>

            <Button type="submit" variant="primary" full disabled={busy !== null || !fullName.trim()}>
              {busy === "profile" ? "Saving…" : "Save profile"}
            </Button>
          </form>
        </Section>

        <Section
          title="Organisation"
          description={
            isOwner
              ? "The name customers and providers see on your bookings."
              : "Only an owner of this organisation can rename it."
          }
        >
          {isOwner ? (
            <form onSubmit={onRenameOrganisation} className="space-y-4">
              <Field
                label="Organisation name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                minLength={2}
                maxLength={200}
              />
              <Button
                type="submit"
                full
                disabled={
                  busy !== null || !orgName.trim() || orgName.trim() === account.organisation.name
                }
              >
                {busy === "organisation" ? "Renaming…" : "Rename organisation"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-fg-muted">{account.organisation.name}</p>
          )}
        </Section>

        <Section
          title="Password"
          description="Changing it signs you out everywhere, including on this device."
        >
          <form onSubmit={onChangePassword} className="space-y-4">
            <Field
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
            <Field
              label="New password"
              type="password"
              autoComplete="new-password"
              hint="At least 10 characters. A memorable phrase beats a short scramble."
              minLength={10}
              maxLength={128}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <Field
              label="Repeat new password"
              type="password"
              autoComplete="new-password"
              error={
                confirmPassword && confirmPassword !== newPassword ? "These do not match" : undefined
              }
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            <Button
              type="submit"
              variant="primary"
              full
              disabled={busy !== null || !currentPassword || newPassword.length < 10}
            >
              {busy === "password" ? "Changing…" : "Change password"}
            </Button>
          </form>
        </Section>

        {/*
          Customers only. A provider's base is coverage — it decides who they
          are shown to — and lives on the onboarding screen with its radius. A
          customer's pin decides nothing; it is only a starting point for the
          search map, which is why it belongs in personal settings.
        */}
        {account.organisation.kind === "CUSTOMER" ? (
          <Section
            title="Default field"
            description="Where the search map opens, so you are not re-pinning the same field every time."
          >
            <form onSubmit={onSaveField} className="space-y-4">
              <MapPicker
                heightClass="h-64"
                initial={fieldPoint ?? undefined}
                onPick={(location) => {
                  setFieldPoint({ latitude: location.latitude, longitude: location.longitude });
                  if (!fieldLabel.trim()) {
                    setFieldLabel(location.label.split(",").slice(0, 2).join(", "));
                  }

                  // Resolve the district NOW, while the geocoder's answer is in
                  // hand. Storing only the coordinates would mean the search
                  // page restores a pin it cannot book against — Booking.areaId
                  // is a required FK, and re-deriving it there would cost
                  // another geocode round trip on every page load.
                  void resolveAreaFromPin(location, states).then((resolved) => {
                    setFieldAreaId(resolved.areaId ?? null);
                  });
                }}
                onClear={() => {
                  setFieldPoint(null);
                  setFieldAreaId(null);
                }}
              />

              {fieldPoint && fieldAreaId === null ? (
                <p className="rounded-control bg-warning-bg px-3 py-2 text-xs text-warning">
                  That pin is outside the districts we cover, so it will not pre-fill the district
                  on a booking. You can still save it.
                </p>
              ) : null}

              <Field
                label="What you call it (optional)"
                placeholder="The north field"
                value={fieldLabel}
                onChange={(e) => setFieldLabel(e.target.value)}
              />

              <div className="flex gap-2">
                <Button type="submit" variant="primary" className="flex-1" disabled={busy !== null}>
                  {busy === "field" ? "Saving…" : "Save default field"}
                </Button>
                {fieldPoint || fieldLabel ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() => void onClearField()}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
            </form>
          </Section>
        ) : null}

        <Section title="Appearance" description="Applies to this browser only.">
          {/*
            A radio group, not a two-state switch: "follow my device" is a real
            third choice, and a toggle cannot express it — it would force
            everyone into a fixed theme the moment they touched it.
          */}
          <fieldset>
            <legend className="sr-only">Theme</legend>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((option) => {
                const on = theme === option.value;

                return (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer flex-col rounded-control border px-3 py-2.5 text-sm transition-colors ${
                      on
                        ? "border-accent bg-bg-sunken font-medium"
                        : "border-border-strong text-fg-muted hover:text-fg"
                    }`}
                  >
                    <input
                      type="radio"
                      name="theme"
                      value={option.value}
                      className="sr-only"
                      checked={on}
                      onChange={() => setTheme(option.value)}
                    />
                    {option.label}
                    <span className="mt-0.5 text-xs font-normal text-fg-subtle">{option.hint}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </Section>
      </div>
    </Page>
  );
}

export default function AccountPage() {
  return (
    <RequireAuth>
      <Account />
    </RequireAuth>
  );
}
