/** Where an account belongs after signing in. */
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
