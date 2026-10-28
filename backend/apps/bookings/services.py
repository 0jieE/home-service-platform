"""Booking lifecycle (SPEC §5). The only module that changes Booking.status.

Every action: check actor + state (`action_error`, also used for `allowed_actions`) ->
transaction + row lock -> (accept) re-run eligibility -> save -> status history -> WS event on commit.
"""

from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Avg, Count
from django.utils import timezone
from rest_framework import status

from apps.accounts.exceptions import BusinessError
from apps.accounts.models import Role, User
from apps.recommendations import eligibility
from apps.technicians.models import TechnicianProfile

from .events import push_booking_event
from .models import (
    ActorRole,
    Booking,
    BookingDispute,
    BookingStatus,
    BookingStatusHistory,
    DisputeDecision,
    DisputeStatus,
    Review,
)

S = BookingStatus

ACTIONS = ["accept", "decline", "cancel", "start", "request_completion", "confirm_completion", "dispute", "review"]

MESSAGES = {
    "booking_conflict": "This technician already has an accepted job that overlaps this time.",
    "technician_unavailable": "The technician is no longer available for this time.",
    "outside_coverage": "This location is outside Kidapawan City coverage.",
}


class ActionError:
    """Why an action is not allowed: 403 (wrong actor) or 409 invalid_transition / other code."""

    def __init__(self, detail: str, code: str = "invalid_transition", http_status: int = status.HTTP_409_CONFLICT):
        self.detail, self.code, self.http_status = detail, code, http_status

    def raise_(self):
        raise BusinessError(self.detail, self.code, self.http_status)


def _forbidden(detail: str) -> ActionError:
    return ActionError(detail, "permission_denied", status.HTTP_403_FORBIDDEN)


def _invalid(detail: str) -> ActionError:
    return ActionError(detail)


def _is_customer(booking: Booking, user: User) -> bool:
    return user.role == Role.CUSTOMER and booking.customer_id == user.id


def _is_technician(booking: Booking, user: User) -> bool:
    return user.role == Role.TECHNICIAN and booking.technician.user_id == user.id


def _has_review(booking: Booking) -> bool:
    try:
        return booking.review is not None
    except Review.DoesNotExist:
        return False


def action_error(booking: Booking, user: User, action: str, now=None) -> ActionError | None:
    """Single source of truth for who may do what, and when. None means allowed."""
    now = now or timezone.now()
    st = booking.status

    if action in ("accept", "decline", "start", "request_completion"):
        if not _is_technician(booking, user):
            return _forbidden("Only the assigned technician can do this.")
        if action == "accept":
            if st != S.PENDING:
                return _invalid(f"Only pending requests can be accepted (current: {st}).")
            if booking.start <= now:
                return _invalid("The requested start time has already passed.")
        elif action == "decline":
            if st != S.PENDING:
                return _invalid(f"Only pending requests can be declined (current: {st}).")
        elif action == "start":
            if st != S.ACCEPTED:
                return _invalid(f"Only accepted bookings can be started (current: {st}).")
            earliest = booking.start - timedelta(minutes=settings.START_EARLY_MINUTES)
            if now < earliest:
                return _invalid(f"You can start at most {settings.START_EARLY_MINUTES} minutes before the scheduled time.")
        elif action == "request_completion":
            if st != S.IN_PROGRESS:
                return _invalid(f"Only in-progress jobs can be marked done (current: {st}).")
            if booking.completion_requested_at is not None:
                return _invalid("Completion has already been requested.")
        return None

    if action in ("confirm_completion", "dispute", "review"):
        if not _is_customer(booking, user):
            return _forbidden("Only the customer who booked can do this.")
        if action in ("confirm_completion", "dispute"):
            if st != S.IN_PROGRESS:
                return _invalid(f"The job is not in progress (current: {st}).")
            if booking.completion_requested_at is None:
                return _invalid("The technician has not requested completion confirmation yet.")
            if booking.open_dispute is not None:
                return _invalid("A dispute is already open for this booking.")
            return None
        # review
        if st != S.COMPLETED:
            return ActionError("Reviews are only possible after completion is confirmed.", "not_completed", 400)
        if _has_review(booking):
            return ActionError("This booking has already been reviewed.", "already_reviewed", 409)
        return None

    if action == "cancel":
        is_customer, is_technician = _is_customer(booking, user), _is_technician(booking, user)
        if not (is_customer or is_technician):
            return _forbidden("Only the customer or the assigned technician can cancel.")
        if st == S.PENDING:
            if not is_customer:
                return _invalid("A technician declines a pending request instead of cancelling it.")
        elif st == S.ACCEPTED:
            pass
        else:
            return _invalid(f"A {st.replace('_', ' ')} booking cannot be cancelled.")
        if booking.start <= now:
            return _invalid("The booking can only be cancelled before its start time.")
        return None

    return _invalid(f"Unknown action: {action}")


def allowed_actions(booking: Booking, user: User, now=None) -> list[str]:
    now = now or timezone.now()
    return [a for a in ACTIONS if action_error(booking, user, a, now) is None]


# --- helpers -------------------------------------------------------------

def actor_role_of(user: User | None) -> str:
    if user is None:
        return ActorRole.SYSTEM
    return {Role.CUSTOMER: ActorRole.CUSTOMER, Role.TECHNICIAN: ActorRole.TECHNICIAN, Role.ADMIN: ActorRole.ADMIN}[
        user.role
    ]


def _record(booking: Booking, previous, event: str, actor: User | None, reason: str = "", role: str | None = None):
    role = role or actor_role_of(actor)
    BookingStatusHistory.objects.create(
        booking=booking,
        from_status=previous,
        to_status=booking.status,
        event=event,
        actor=actor,
        actor_role=role,
        reason=reason or "",
    )
    push_booking_event(booking, event, previous, role)


def _locked(booking_id: int) -> Booking:
    return (
        Booking.objects.select_for_update(of=("self",))
        .select_related("technician__user", "customer", "category")
        .get(pk=booking_id)
    )


def _check(booking: Booking, user: User, action: str) -> None:
    err = action_error(booking, user, action)
    if err is not None:
        err.raise_()


def _reason(value) -> str:
    return (value or "").strip()


# --- create --------------------------------------------------------------

@transaction.atomic
def create_booking(*, customer: User, technician: TechnicianProfile, category, point, address, start, end, notes=""):
    TechnicianProfile.objects.select_for_update().filter(pk=technician.pk).first()
    code = eligibility.check_technician(technician, category, point, start, end)
    if code == eligibility.OUTSIDE_COVERAGE:
        raise BusinessError(MESSAGES["outside_coverage"], code, 400)
    if code is not None:
        # A reserved overlap at request time also means "not available" for the customer.
        raise BusinessError(
            "This technician is not available for the selected service and time. Pick another time or technician.",
            eligibility.TECHNICIAN_UNAVAILABLE,
            400,
        )
    booking = Booking.objects.create(
        customer=customer,
        technician=technician,
        category=category,
        location=point,
        address=address,
        start=start,
        end=end,
        notes=notes or "",
        distance_km=eligibility.distance_km(technician, point),
        status=S.PENDING,
    )
    _record(booking, None, "created", customer)
    return booking


# --- technician actions --------------------------------------------------

@transaction.atomic
def accept(booking_id: int, user: User) -> Booking:
    booking = _locked(booking_id)
    _check(booking, user, "accept")
    # Lock the technician row so concurrent accepts / availability edits serialize.
    technician = TechnicianProfile.objects.select_for_update().get(pk=booking.technician_id)
    code = eligibility.check_technician(technician, booking.category, booking.location, booking.start, booking.end)
    if code is not None:
        raise BusinessError(MESSAGES.get(code, MESSAGES["technician_unavailable"]), code, status.HTTP_409_CONFLICT)
    previous = booking.status
    booking.status = S.ACCEPTED
    try:
        with transaction.atomic():
            booking.save(update_fields=["status", "updated_at"])
    except IntegrityError:
        # PostgreSQL exclusion constraint: another accepted/in-progress booking overlaps.
        raise BusinessError(MESSAGES["booking_conflict"], "booking_conflict", status.HTTP_409_CONFLICT)
    _record(booking, previous, "accepted", user)
    return booking


@transaction.atomic
def decline(booking_id: int, user: User, reason: str = "") -> Booking:
    booking = _locked(booking_id)
    _check(booking, user, "decline")
    previous = booking.status
    booking.status = S.DECLINED
    booking.decline_reason = _reason(reason) or None
    booking.save(update_fields=["status", "decline_reason", "updated_at"])
    _record(booking, previous, "declined", user, _reason(reason))
    return booking


@transaction.atomic
def start(booking_id: int, user: User) -> Booking:
    booking = _locked(booking_id)
    _check(booking, user, "start")
    previous = booking.status
    booking.status = S.IN_PROGRESS
    booking.started_at = timezone.now()
    booking.save(update_fields=["status", "started_at", "updated_at"])
    _record(booking, previous, "started", user)
    return booking


@transaction.atomic
def request_completion(booking_id: int, user: User, notes: str = "") -> Booking:
    booking = _locked(booking_id)
    _check(booking, user, "request_completion")
    booking.completion_requested_at = timezone.now()
    booking.completion_notes = _reason(notes)
    booking.save(update_fields=["completion_requested_at", "completion_notes", "updated_at"])
    _record(booking, booking.status, "completion_requested", user, _reason(notes))
    return booking


# --- customer / shared actions ------------------------------------------

@transaction.atomic
def cancel(booking_id: int, user: User, reason: str = "") -> Booking:
    booking = _locked(booking_id)
    _check(booking, user, "cancel")
    reason = _reason(reason)
    if booking.status == S.ACCEPTED and not reason:
        raise BusinessError("Please give a reason for cancelling an accepted booking.", "reason_required", 400)
    previous = booking.status
    booking.status = S.CANCELLED
    booking.cancellation_reason = reason or None
    booking.cancelled_by_role = actor_role_of(user)
    booking.save(update_fields=["status", "cancellation_reason", "cancelled_by_role", "updated_at"])
    _record(booking, previous, "cancelled", user, reason)
    return booking


@transaction.atomic
def confirm_completion(booking_id: int, user: User) -> Booking:
    booking = _locked(booking_id)
    _check(booking, user, "confirm_completion")
    previous = booking.status
    booking.status = S.COMPLETED
    booking.completed_at = timezone.now()
    booking.confirmed_by = "customer"
    booking.save(update_fields=["status", "completed_at", "confirmed_by", "updated_at"])
    _record(booking, previous, "completed", user)
    return booking


@transaction.atomic
def open_dispute(booking_id: int, user: User, reason: str) -> BookingDispute:
    booking = _locked(booking_id)
    _check(booking, user, "dispute")
    reason = _reason(reason)
    if not reason:
        raise BusinessError("Please describe the problem so the administrator can review it.", "reason_required", 400)
    dispute = BookingDispute.objects.create(booking=booking, opened_by=user, reason=reason)
    _record(booking, booking.status, "disputed", user, reason)
    return dispute


@transaction.atomic
def resolve_dispute(dispute_id: int, admin: User, decision: str, admin_notes: str = "") -> BookingDispute:
    if admin.role != Role.ADMIN:
        raise BusinessError("Only administrators can resolve disputes.", "permission_denied", 403)
    dispute = BookingDispute.objects.select_for_update().get(pk=dispute_id)
    if dispute.status != DisputeStatus.OPEN:
        raise BusinessError("This dispute is already resolved.", "invalid_transition", 409)
    booking = _locked(dispute.booking_id)
    if booking.status != S.IN_PROGRESS:
        raise BusinessError(f"The booking is no longer in progress (current: {booking.status}).", "invalid_transition", 409)
    notes = _reason(admin_notes)
    previous = booking.status
    if decision == DisputeDecision.COMPLETED:
        booking.status = S.COMPLETED
        booking.completed_at = timezone.now()
        booking.confirmed_by = "admin"
    elif decision == DisputeDecision.CANCELLED:
        booking.status = S.CANCELLED
        booking.cancelled_by_role = ActorRole.ADMIN
        booking.cancellation_reason = notes or "Cancelled by administrator after dispute review."
    elif decision == DisputeDecision.RETURN_IN_PROGRESS:
        # Work continues; the technician requests completion again when done.
        booking.completion_requested_at = None
    else:
        raise BusinessError("Unknown decision.", "invalid_transition", 400)
    booking.save()
    dispute.status = DisputeStatus.RESOLVED
    dispute.decision = decision
    dispute.admin_notes = notes
    dispute.resolved_by = admin
    dispute.resolved_at = timezone.now()
    dispute.save()
    reason = f"Dispute resolved: {DisputeDecision(decision).label}." + (f" {notes}" if notes else "")
    _record(booking, previous, "dispute_resolved", admin, reason, role=ActorRole.ADMIN)
    return dispute


@transaction.atomic
def add_review(booking_id: int, user: User, rating: int, comment: str = "") -> Review:
    booking = _locked(booking_id)
    _check(booking, user, "review")
    try:
        with transaction.atomic():
            review = Review.objects.create(booking=booking, rating=rating, comment=(comment or "").strip())
    except IntegrityError:
        raise BusinessError("This booking has already been reviewed.", "already_reviewed", 409)
    refresh_rating(booking.technician_id)
    push_booking_event(booking, "reviewed", booking.status, ActorRole.CUSTOMER)
    return review


def refresh_rating(technician_id: int) -> None:
    """Recompute from all reviews (aggregate, no incremental drift) in the caller's transaction."""
    technician = TechnicianProfile.objects.select_for_update().get(pk=technician_id)
    agg = Review.objects.filter(booking__technician_id=technician_id).aggregate(avg=Avg("rating"), n=Count("id"))
    technician.rating_avg = float(agg["avg"]) if agg["n"] else None
    technician.rating_count = agg["n"]
    technician.save(update_fields=["rating_avg", "rating_count", "updated_at"])


# --- system --------------------------------------------------------------

def expire_stale_pending(now=None) -> int:
    """Pending bookings whose start has passed become cancelled (actor system, reason "expired")."""
    now = now or timezone.now()
    count = 0
    ids = list(Booking.objects.filter(status=S.PENDING, start__lte=now).values_list("id", flat=True))
    for booking_id in ids:
        with transaction.atomic():
            booking = _locked(booking_id)
            if booking.status != S.PENDING or booking.start > now:
                continue
            booking.status = S.CANCELLED
            booking.cancelled_by_role = ActorRole.SYSTEM
            booking.cancellation_reason = "expired"
            booking.save(update_fields=["status", "cancelled_by_role", "cancellation_reason", "updated_at"])
            _record(booking, S.PENDING, "cancelled", None, "expired", role=ActorRole.SYSTEM)
            count += 1
    return count
