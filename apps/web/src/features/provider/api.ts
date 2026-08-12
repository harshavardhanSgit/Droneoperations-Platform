import { ApiError, apiFetch } from "@/core/api/client";
import type {
  Provider,
  ProviderDetail,
  ProviderDocument,
  UploadTicket,
} from "@/core/api/types";

export interface ProviderProfileInput {
  legalName: string;
  registrationNumber?: string;
  contactPhone: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
}

/**
 * Where the business works from and how far it will go.
 *
 * A separate call from the profile, because the API treats them differently:
 * business details are verified and re-enter review if changed, so they lock
 * once activated. Coverage was never reviewed and stays editable for life —
 * which is the point, since it changes whenever the fleet does.
 */
export interface ProviderCoverageInput {
  /** Point picked on the map. Sent as a pair, or not at all. */
  latitude?: number;
  longitude?: number;
  /** Kilometres travelled from that base. The API rejects it without a base. */
  serviceRadiusKm?: number;
}

export const getOwnProvider = () => apiFetch<ProviderDetail>("/api/v1/providers/me");

export const saveProfile = (input: ProviderProfileInput) =>
  apiFetch<Provider>("/api/v1/providers/me/profile", {
    method: "PUT",
    body: JSON.stringify(input),
  });

export const saveCoverage = (input: ProviderCoverageInput) =>
  apiFetch<Provider>("/api/v1/providers/me/coverage", {
    method: "PUT",
    body: JSON.stringify(input),
  });

export const submitForReview = () =>
  apiFetch<Provider>("/api/v1/providers/me/submit", { method: "POST" });

export const listOwnDocuments = () =>
  apiFetch<ProviderDocument[]>("/api/v1/providers/me/documents");

/**
 * The three-step upload.
 *
 * Step 2 deliberately uses raw `fetch`, NOT apiFetch: those bytes go to the
 * storage service, not to our API. It carries no bearer token and expects no
 * `{ data }` envelope — the signed URL is the entire authorisation. In
 * production that request goes to a different host altogether.
 */
export async function uploadDocument(
  kind: string,
  file: File,
): Promise<ProviderDocument> {
  const ticket = await apiFetch<UploadTicket>("/api/v1/providers/me/documents", {
    method: "POST",
    body: JSON.stringify({
      kind,
      filename: file.name,
      contentType: file.type,
    }),
  });

  if (file.size > ticket.maxBytes) {
    throw new ApiError(
      "FILE_TOO_LARGE",
      `File is ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum is ${(
        ticket.maxBytes /
        1024 /
        1024
      ).toFixed(0)} MB.`,
      0,
    );
  }

  const upload = await fetch(ticket.uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "content-type": file.type },
  });

  if (!upload.ok) {
    throw new ApiError("UPLOAD_FAILED", "The file could not be uploaded", upload.status);
  }

  // file.size rather than anything the storage layer returns, because S3 will
  // not report it back. Note the client is therefore asserting the size — the
  // server should verify with a HEAD against storage before trusting it.
  return apiFetch<ProviderDocument>(
    `/api/v1/providers/me/documents/${ticket.documentId}/confirm`,
    { method: "POST", body: JSON.stringify({ sizeBytes: file.size }) },
  );
}
