"""Application decisions and technician account creation (admin only, approved applicants only)."""

from django.db import transaction
from django.utils import timezone

from apps.accounts.exceptions import BusinessError
from apps.accounts.models import Role, User
from apps.accounts.services import issue_activation_code
from apps.technicians.models import TechnicianProfile, TechnicianService

from .models import ApplicationStatus, TechnicianApplication

OPEN_STATUSES = (ApplicationStatus.SUBMITTED, ApplicationStatus.UNDER_REVIEW)


def _locked(application_id: int) -> TechnicianApplication:
    return TechnicianApplication.objects.select_for_update().get(pk=application_id)


@transaction.atomic
def approve(application_id: int, admin: User) -> TechnicianApplication:
    app = _locked(application_id)
    if app.status not in OPEN_STATUSES:
        raise BusinessError(f"Only submitted or under-review applications can be approved (current: {app.status}).",
                            "invalid_transition", 409)
    app.status = ApplicationStatus.APPROVED
    app.decided_by = admin
    app.decided_at = timezone.now()
    app.rejection_reason = ""
    app.save()
    return app


@transaction.atomic
def reject(application_id: int, admin: User, reason: str) -> TechnicianApplication:
    app = _locked(application_id)
    if app.status not in OPEN_STATUSES:
        raise BusinessError(f"Only submitted or under-review applications can be rejected (current: {app.status}).",
                            "invalid_transition", 409)
    reason = (reason or "").strip()
    if not reason:
        raise BusinessError("Please record the reason for rejecting the application.", "reason_required", 400)
    app.status = ApplicationStatus.REJECTED
    app.decided_by = admin
    app.decided_at = timezone.now()
    app.rejection_reason = reason
    app.save()
    return app


@transaction.atomic
def create_technician_account(application_id: int, admin: User) -> dict:
    """User (inactive until activation) + TechnicianProfile + requested services + one-time code."""
    app = _locked(application_id)
    if app.status != ApplicationStatus.APPROVED:
        raise BusinessError("A technician account can only be created for an approved application.",
                            "application_not_approved", 409)
    if TechnicianProfile.objects.filter(application=app).exists():
        raise BusinessError("An account was already created for this application.", "account_exists", 409)
    if User.objects.filter(email__iexact=app.email).exists():
        raise BusinessError(f"A user with the email {app.email} already exists.", "account_exists", 409)

    user = User.objects.create_user(
        email=app.email,
        password=None,
        first_name=app.first_name,
        last_name=app.last_name,
        phone=app.phone,
        role=Role.TECHNICIAN,
        is_active=False,  # becomes active when the technician sets a password with the code
    )
    profile = TechnicianProfile.objects.create(
        user=user, application=app, phone=app.phone, address=app.address, is_approved=True
    )
    TechnicianService.objects.bulk_create(
        [TechnicianService(technician=profile, category=c) for c in app.requested_categories.filter(is_active=True)]
    )
    code, record = issue_activation_code(user, created_by=admin)
    return {"user": user, "profile": profile, "activation_code": code, "expires_at": record.expires_at}


@transaction.atomic
def reissue_activation_code(application_id: int, admin: User) -> dict:
    app = _locked(application_id)
    profile = TechnicianProfile.objects.filter(application=app).select_related("user").first()
    if profile is None:
        raise BusinessError("No account has been created for this application yet.", "invalid_activation", 409)
    user = profile.user
    if user.has_usable_password():
        raise BusinessError("This technician has already activated the account.", "account_exists", 409)
    code, record = issue_activation_code(user, created_by=admin)
    return {"user": user, "profile": profile, "activation_code": code, "expires_at": record.expires_at}
