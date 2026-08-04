"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/form";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState, PageHeader, Surface } from "@/components/ui/surface";
import { ApiError } from "@/core/api/client";
import type { Drone, Ticket } from "@/core/api/types";
import { RequireAuth } from "@/core/auth/require-auth";
import {
  DRONE_LABEL,
  DRONE_TONE,
  TICKET_LABEL,
  TICKET_TONE,
  whenShort,
} from "@/features/maintenance/format";
import * as assets from "@/features/provider/assets-api";

function Drones() {
  const [drones, setDrones] = useState<Drone[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [adding, setAdding] = useState(false);
  const [model, setModel] = useState("");
  const [registration, setRegistration] = useState("");
  const [capacity, setCapacity] = useState("");

  const [faultFor, setFaultFor] = useState<string | null>(null);
  const [fault, setFault] = useState("");

  const load = () =>
    Promise.all([assets.listDrones(), assets.listOwnTickets()])
      .then(([d, t]) => {
        setDrones(d);
        setTickets(t.items);
      })
      .catch((caught: unknown) =>
        setError(caught instanceof ApiError ? caught.message : "Could not load your drones"),
      )
      .finally(() => setLoading(false));

  useEffect(() => {
    void load();
  }, []);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      setAdding(false);
      setFaultFor(null);
      setModel("");
      setRegistration("");
      setCapacity("");
      setFault("");
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : "That did not go through");
    } finally {
      setBusy(false);
    }
  };

  const openTicketFor = (droneId: string) =>
    tickets.find(
      (t) => t.droneId === droneId && t.status !== "CLOSED" && t.status !== "CANCELLED",
    );

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10">
      <PageHeader
        title="My drones"
        description="Your machines, and anything that is stopping them flying."
        action={
          !adding ? (
            <Button onClick={() => setAdding(true)}>Add a drone</Button>
          ) : null
        }
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
              hint="The UIN issued by DGCA."
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
                disabled={!model.trim() || !registration.trim() || busy}
                onClick={() =>
                  void run(() =>
                    assets.registerDrone({
                      model: model.trim(),
                      registrationNumber: registration.trim(),
                      ...(capacity ? { capacityLitres: Number(capacity) } : {}),
                    }),
                  )
                }
              >
                Add drone
              </Button>
            </div>
          </div>
        </Surface>
      ) : null}

      {loading ? (
        <p className="text-sm text-fg-subtle">Loading…</p>
      ) : drones.length === 0 && !adding ? (
        <EmptyState
          title="No drones registered"
          description="Add your machines so you can report faults and keep track of servicing."
          action={<Button onClick={() => setAdding(true)}>Add a drone</Button>}
        />
      ) : (
        <ul className="space-y-3">
          {drones.map((drone) => {
            const open = openTicketFor(drone.id);

            return (
              <Surface as="li" key={drone.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{drone.model}</p>
                    <p className="tabular mt-0.5 text-sm text-fg-muted">
                      {drone.registrationNumber}
                      {drone.capacityLitres ? ` · ${drone.capacityLitres}L` : ""}
                    </p>
                  </div>
                  <StatusPill tone={DRONE_TONE[drone.serviceability] ?? "neutral"}>
                    {DRONE_LABEL[drone.serviceability] ?? drone.serviceability}
                  </StatusPill>
                </div>

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
                      hint="Reporting a fault grounds this drone until an engineer closes the job."
                      value={fault}
                      onChange={(e) => setFault(e.target.value)}
                      placeholder="Pump losing pressure mid-flight"
                    />
                    <div className="flex gap-2">
                      <Button variant="ghost" className="flex-1" onClick={() => setFaultFor(null)}>
                        Cancel
                      </Button>
                      <Button
                        variant="danger"
                        className="flex-1"
                        disabled={fault.trim().length < 10 || busy}
                        onClick={() => void run(() => assets.raiseTicket(drone.id, fault.trim()))}
                      >
                        Report fault
                      </Button>
                    </div>
                  </div>
                ) : drone.serviceability === "RETIRED" ? null : (
                  <div className="mt-4">
                    <Button full onClick={() => setFaultFor(drone.id)}>
                      Report a fault
                    </Button>
                  </div>
                )}
              </Surface>
            );
          })}
        </ul>
      )}
    </main>
  );
}

export default function ProviderDronesPage() {
  return (
    <RequireAuth>
      <Drones />
    </RequireAuth>
  );
}
