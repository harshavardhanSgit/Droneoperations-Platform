"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/form";
import { CardListSkeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { cardGrid, EmptyState, Page, PageHeader, Surface } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/core/api/client";
import type { Drone, Ticket } from "@/core/api/types";
import { RequireAuth, RequireRole } from "@/core/auth/require-auth";
import {
  DRONE_LABEL,
  DRONE_TONE,
  TICKET_LABEL,
  TICKET_TONE,
  whenShort,
} from "@/features/maintenance/format";
import * as assets from "@/features/provider/assets-api";

const FAULT_MIN = 10;

function Drones() {
  const toast = useToast();

  const [drones, setDrones] = useState<Drone[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [model, setModel] = useState("");
  const [registration, setRegistration] = useState("");
  const [capacity, setCapacity] = useState("");

  const [faultFor, setFaultFor] = useState<string | null>(null);
  const [fault, setFault] = useState("");

  /**
   * The drone added a moment ago. A list that silently grows by one leaves the
   * user hunting for what changed — five machines all look alike in plain text.
   * Cleared on the next action rather than on a timer, so it is still there when
   * they look up from the form.
   */
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const load = () =>
    Promise.all([assets.listDrones(), assets.listOwnTickets()]).then(([d, t]) => {
      setDrones(d);
      setTickets(t.items);
    });

  useEffect(() => {
    let cancelled = false;

    Promise.all([assets.listDrones(), assets.listOwnTickets()])
      .then(([d, t]) => {
        if (cancelled) return;
        setDrones(d);
        setTickets(t.items);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : "Could not load your drones");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (key: string, work: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await work();
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : "That did not go through");
    } finally {
      setBusy(null);
    }
  };

  const addDrone = () =>
    run("add", async () => {
      const created = await assets.registerDrone({
        model: model.trim(),
        registrationNumber: registration.trim(),
        ...(capacity ? { capacityLitres: Number(capacity) } : {}),
      });

      setAdding(false);
      setModel("");
      setRegistration("");
      setCapacity("");
      setJustAdded(created.id);
      toast(`${created.model} added`);
    });

  const reportFault = (drone: Drone) =>
    run(drone.id, async () => {
      await assets.raiseTicket(drone.id, fault.trim());
      setFaultFor(null);
      setFault("");
      setJustAdded(null);
      toast(`${drone.model} grounded — an engineer will be assigned`, "warning");
    });

  const toggleRetired = (drone: Drone) =>
    run(drone.id, async () => {
      const next = drone.serviceability === "RETIRED" ? "SERVICEABLE" : "RETIRED";
      await assets.setServiceability(drone.id, next);
      setJustAdded(null);
      toast(next === "RETIRED" ? `${drone.model} retired` : `${drone.model} back in service`);
    });

  const openTicketFor = (droneId: string) =>
    tickets.find((t) => t.droneId === droneId && t.status !== "CLOSED" && t.status !== "CANCELLED");

  const remaining = FAULT_MIN - fault.trim().length;

  return (
    <Page>
      <PageHeader
        title="My drones"
        description="Your machines, and anything that is stopping them flying."
        action={!adding ? <Button onClick={() => setAdding(true)}>Add a drone</Button> : null}
      />

      <FormError message={error} />

      {adding ? (
        <Surface className="mb-4 p-4">
          <div className="space-y-3">
            <Field
              label="Model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Marut AG365"
            />
            <Field
              label="Registration number"
              hint="The UIN issued by DGCA. Must be unique across the platform."
              value={registration}
              onChange={(e) => setRegistration(e.target.value)}
              placeholder="UIN-TG-0042"
            />
            <Field
              label="Tank capacity in litres (optional)"
              type="number"
              inputMode="numeric"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="10"
            />
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={!model.trim() || !registration.trim() || busy === "add"}
                onClick={() => void addDrone()}
              >
                {busy === "add" ? "Adding…" : "Add drone"}
              </Button>
            </div>
          </div>
        </Surface>
      ) : null}

      {loading ? (
        <CardListSkeleton />
      ) : drones.length === 0 && !adding ? (
        <EmptyState
          title="No drones registered"
          description="Add your machines so you can report faults and keep track of servicing."
          action={<Button onClick={() => setAdding(true)}>Add a drone</Button>}
        />
      ) : (
        <ul className={cardGrid}>
          {drones.map((drone) => {
            const open = openTicketFor(drone.id);
            const working = busy === drone.id;
            const isNew = justAdded === drone.id;

            return (
              <Surface
                as="li"
                key={drone.id}
                className={`p-4 ${isNew ? "ring-2 ring-success" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{drone.model}</p>
                    <p className="tabular mt-0.5 text-sm text-fg-muted">
                      {drone.registrationNumber}
                      {drone.capacityLitres ? ` · ${drone.capacityLitres}L tank` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusPill tone={DRONE_TONE[drone.serviceability] ?? "neutral"}>
                      {DRONE_LABEL[drone.serviceability] ?? drone.serviceability}
                    </StatusPill>
                    {isNew ? (
                      <span className="text-xs font-medium text-success">Just added</span>
                    ) : null}
                  </div>
                </div>

                {/* openTickets has been on the API since day one and never shown. */}
                {drone.openTickets > 0 && !open ? (
                  <p className="mt-2 text-xs text-fg-subtle">
                    {drone.openTickets} open {drone.openTickets === 1 ? "ticket" : "tickets"}
                  </p>
                ) : null}

                {open ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm">{open.description}</p>
                      <StatusPill tone={TICKET_TONE[open.status] ?? "neutral"} size="console">
                        {TICKET_LABEL[open.status] ?? open.status}
                      </StatusPill>
                    </div>
                    <p className="mt-1 text-xs text-fg-subtle">
                      Reported {whenShort(open.createdAt)}. The platform assigns an engineer.
                    </p>
                  </div>
                ) : faultFor === drone.id ? (
                  <div className="mt-4 space-y-3 border-t border-border pt-4">
                    <Field
                      label="What is wrong with it?"
                      // Live, not after submit: the rule is knowable before the
                      // button is pressed, so say it before the button is pressed.
                      hint={
                        remaining > 0
                          ? `${remaining} more ${remaining === 1 ? "character" : "characters"} — the engineer needs enough to work with`
                          : "Reporting this grounds the drone until an engineer closes the job."
                      }
                      value={fault}
                      onChange={(e) => setFault(e.target.value)}
                      placeholder="Pump losing pressure mid-flight"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        className="flex-1"
                        onClick={() => {
                          setFaultFor(null);
                          setFault("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="danger"
                        className="flex-1"
                        disabled={remaining > 0 || working}
                        onClick={() => void reportFault(drone)}
                      >
                        {working ? "Reporting…" : "Report fault"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex gap-2">
                    {drone.serviceability === "RETIRED" ? (
                      <Button
                        className="flex-1"
                        disabled={working}
                        onClick={() => void toggleRetired(drone)}
                      >
                        {working ? "Working…" : "Bring back into service"}
                      </Button>
                    ) : (
                      <>
                        <Button
                          className="flex-1"
                          disabled={working}
                          onClick={() => {
                            setFaultFor(drone.id);
                            setFault("");
                          }}
                        >
                          Report a fault
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={working}
                          onClick={() => void toggleRetired(drone)}
                        >
                          Retire
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </Surface>
            );
          })}
        </ul>
      )}
    </Page>
  );
}

export default function ProviderDronesPage() {
  return (
    <RequireAuth>
      <RequireRole kind="PROVIDER">
        <Drones />
      </RequireRole>
    </RequireAuth>
  );
}
