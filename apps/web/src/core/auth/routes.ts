/**
 * Where an account belongs after signing in.
 *
 * Keyed on organisation kind, mirroring how the backend derives permissions.
 * One place to change when PLATFORM gets its own console.
 */
export function landingRouteFor(organisationKind: string): string {
  switch (organisationKind) {
    case "PROVIDER":
      return "/provider/onboarding";
    case "PLATFORM":
      return "/admin/providers";
    case "CUSTOMER":
      return "/bookings";
    default:
      return "/dashboard";
  }
}
