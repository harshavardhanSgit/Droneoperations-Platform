import type { components } from "./schema";

/**
 * Every type here is derived from the backend's OpenAPI spec via
 * `npm run web:generate-api`. Nothing is hand-written, so the frontend cannot
 * silently drift from the API contract.
 */
export type Liveness = components["schemas"]["LivenessResponseDto"];
export type Readiness = components["schemas"]["ReadinessResponseDto"];
export type ErrorEnvelope = components["schemas"]["ErrorEnvelopeDto"];

export type LoginResponse = components["schemas"]["LoginResponseDto"];
export type RegisterResponse = components["schemas"]["RegisterResponseDto"];
export type CurrentAccount = components["schemas"]["MeResponseDto"];
export type Organisation = components["schemas"]["RegisteredOrganisationDto"];

export type Provider = components["schemas"]["ProviderDto"];
export type ProviderDetail = components["schemas"]["ProviderDetailDto"];
export type ProviderList = components["schemas"]["ProviderListDto"];
export type ProviderStageEvent = components["schemas"]["ProviderStageEventDto"];
export type UploadTicket = components["schemas"]["UploadTicketDto"];
export type ProviderDocument = components["schemas"]["DocumentDto"];

export type ServiceType = components["schemas"]["ServiceTypeDto"];
export type Area = components["schemas"]["AreaDto"];
export type MatchResults = components["schemas"]["MatchResultsDto"];
export type Match = components["schemas"]["MatchDto"];
export type Booking = components["schemas"]["BookingDto"];
export type BookingDetail = components["schemas"]["BookingDetailDto"];
export type BookingList = components["schemas"]["BookingListDto"];
export type Payment = components["schemas"]["PaymentDto"];
export type Review = components["schemas"]["ReviewDto"];
export type Earnings = components["schemas"]["EarningsDto"];
export type StaffMember = components["schemas"]["StaffMemberDto"];
export type StaffList = components["schemas"]["StaffListDto"];

export type Drone = components["schemas"]["DroneDto"];
export type Ticket = components["schemas"]["TicketDto"];
export type TicketDetail = components["schemas"]["TicketDetailDto"];
export type TicketList = components["schemas"]["TicketListDto"];

export type Notification = components["schemas"]["NotificationDto"];
export type NotificationList = components["schemas"]["NotificationListDto"];
