/** TypeScript mirror of docs/API_CONTRACT.md (v1). */

// ---------- Enums (§1) ----------
export type Role = 'customer' | 'technician' | 'admin';
export type BookingStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'in_progress' | 'completed';
export type ApplicationStatus = 'submitted' | 'under_review' | 'approved' | 'rejected';
export type VerificationMethod = 'official_portal' | 'issuing_institution' | 'in_person_inspection';
export type VerificationOutcome = 'verified' | 'not_verified' | 'inconclusive';
export type AvailabilityState = 'available' | 'unavailable';
export type DisputeStatus = 'open' | 'resolved';
export type DisputeDecision = 'completed' | 'cancelled' | 'return_in_progress';
export type BookingAction =
  | 'accept'
  | 'decline'
  | 'cancel'
  | 'start'
  | 'request_completion'
  | 'confirm_completion'
  | 'dispute'
  | 'review';
export type ActorRole = 'customer' | 'technician' | 'system' | 'admin';
export type BookingEvent =
  | 'created'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'started'
  | 'completion_requested'
  | 'completed'
  | 'disputed'
  | 'dispute_resolved'
  | 'reviewed';
export type ErrorCode =
  | 'outside_coverage'
  | 'no_eligible_technicians'
  | 'technician_unavailable'
  | 'booking_conflict'
  | 'invalid_transition'
  | 'reason_required'
  | 'already_reviewed'
  | 'not_completed'
  | 'profile_incomplete'
  | 'application_not_approved'
  | 'account_exists'
  | 'invalid_activation';

export const BOOKING_STATUSES: BookingStatus[] = [
  'pending',
  'accepted',
  'in_progress',
  'completed',
  'declined',
  'cancelled',
];
export const ACTIVE_STATUSES: BookingStatus[] = ['pending', 'accepted', 'in_progress'];
export const PAST_STATUSES: BookingStatus[] = ['completed', 'declined', 'cancelled'];

// ---------- Shared objects (§2) ----------
export interface Point {
  lat: number;
  lng: number;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  role: Role;
  is_active: boolean;
  date_joined: string;
  technician_profile_id: number | null;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  is_active: boolean;
}
export type CategoryRef = Category;

export interface TechnicianSummary {
  id: number;
  user_id: number;
  full_name: string;
  phone: string;
  specializations: CategoryRef[];
  years_experience: number | null;
  bio: string;
  address: string;
  location: Point | null;
  rating_avg: number | null;
  rating_count: number;
  rating_display: string;
  is_profile_complete: boolean;
}

export interface VerificationSummaryItem {
  credential_type: string;
  outcome: VerificationOutcome;
  checked_on: string;
}

export interface Review {
  id: number;
  booking_id: number;
  rating: number;
  comment: string;
  customer_name: string;
  created_at: string;
}

export interface TechnicianDetail extends TechnicianSummary {
  verification_summary: VerificationSummaryItem[];
  recent_reviews: Review[];
}

export interface TechnicianMe extends TechnicianDetail {
  missing_fields: string[];
}

export interface AvailabilitySlot {
  id: number;
  start: string;
  end: string;
  state: AvailabilityState;
}

export interface TimeRange {
  start: string;
  end: string;
}

export interface TechnicianAvailability {
  slots: AvailabilitySlot[];
  reserved: TimeRange[];
}

export interface PartyRef {
  id: number;
  full_name: string;
  phone: string;
}

export interface BookingDisputeInfo {
  id: number;
  status: DisputeStatus;
  reason: string;
  decision: DisputeDecision | null;
  admin_notes: string;
  created_at: string;
  resolved_at: string | null;
}

export interface StatusHistoryEntry {
  from_status: BookingStatus | null;
  to_status: BookingStatus;
  /** Backend extra: the event name, e.g. completion_requested. */
  event?: BookingEvent;
  actor_role: ActorRole;
  actor_name: string | null;
  reason: string;
  created_at: string;
}

export interface Booking {
  id: number;
  status: BookingStatus;
  customer: PartyRef;
  technician: PartyRef;
  category: CategoryRef;
  address: string;
  location: Point;
  start: string;
  end: string;
  notes: string;
  distance_km: number | null;
  /** Backend extras (not in contract v1): set on start / completion request. */
  started_at?: string | null;
  completion_notes?: string;
  completion_requested_at: string | null;
  completed_at: string | null;
  confirmed_by: 'customer' | 'admin' | null;
  cancellation_reason: string | null;
  cancelled_by_role: ActorRole | null;
  decline_reason: string | null;
  conflicts_with_reserved: boolean;
  dispute: BookingDisputeInfo | null;
  review: Review | null;
  allowed_actions: BookingAction[];
  status_history?: StatusHistoryEntry[];
  created_at: string;
  updated_at: string;
}

// ---------- Config & coverage ----------
export interface RecSettings {
  w_p: number;
  w_r: number;
  d0_km: number;
  no_rating_q: number;
  version: number;
  is_frozen?: boolean;
  updated_at?: string;
}

export interface AppConfig {
  booking_block_minutes: number;
  slot_step_minutes: number;
  timezone: string;
  city_center: Point;
  recommendation_settings: RecSettings;
  coverage: { name: string; verified: boolean; version: string | number };
}

export type GeoJsonGeometry =
  { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] };

export interface Coverage {
  name: string;
  source: string;
  version: string | number;
  verified: boolean;
  geometry: GeoJsonGeometry;
}

export interface AdminCoverage extends Coverage {
  is_placeholder: boolean;
}

// ---------- Auth ----------
export interface TokenResponse {
  access: string;
  refresh: string;
  user: User;
}

export interface CustomerProfile {
  phone: string;
  default_address: string;
  default_location: Point | null;
}

// ---------- Recommendations ----------
export interface RecommendationResult {
  rank: number;
  technician: TechnicianSummary;
  distance_km: number;
  proximity_score: number;
  rating_score: number;
  score: number;
  has_ratings: boolean;
  availability: { slot_id: number; start: string; end: string };
}

export interface RecommendationResponse {
  query: { category: CategoryRef; location: Point; start: string; end: string };
  settings: RecSettings;
  results: RecommendationResult[];
  empty_reason: { code: string; message: string } | null;
}

// ---------- Admin ----------
export interface Verification {
  id: number;
  credential_type: string;
  method: VerificationMethod;
  outcome: VerificationOutcome;
  checked_on: string;
  notes: string;
  checked_by_name: string;
  created_at: string;
}

export interface Application {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  requested_categories: CategoryRef[];
  notes: string;
  status: ApplicationStatus;
  submitted_at: string;
  decided_at: string | null;
  decided_by_name: string | null;
  rejection_reason: string | null;
  verifications: Verification[];
  technician_profile_id: number | null;
  account_created: boolean;
}

export interface CreateAccountResponse {
  user: User;
  technician_profile_id: number;
  activation_code: string;
  expires_at: string;
}

export interface AdminStats {
  totals: {
    customers: number;
    technicians: number;
    active_technicians: number;
    pending_applications: number;
    bookings: number;
    completed_bookings: number;
    open_disputes: number;
    avg_rating: number | null;
  };
  bookings_by_status: { status: BookingStatus; count: number }[];
  bookings_by_category: { category: string; count: number }[];
  bookings_per_week: { week_start: string; count: number }[];
  top_technicians: {
    id: number;
    full_name: string;
    rating_avg: number | null;
    rating_count: number;
    completed: number;
  }[];
}

export interface AdminDispute {
  id: number;
  booking: Booking;
  reason: string;
  status: DisputeStatus;
  decision: DisputeDecision | null;
  admin_notes: string;
  opened_by_name: string;
  resolved_by_name?: string | null;
  created_at: string;
  resolved_at: string | null;
}

// ---------- WebSocket ----------
export interface BookingUpdatedMessage {
  type: 'booking.updated';
  booking_id: number;
  status: BookingStatus;
  previous_status: BookingStatus | null;
  event: BookingEvent;
  actor_role: ActorRole;
  at: string;
}
