"""Demo data per docs/API_CONTRACT.md §5. Idempotent; --reset wipes demo rows first.

    python manage.py seed_demo [--reset]
"""

from datetime import datetime, time, timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import CustomerProfile, Role, User
from apps.applications.models import (
    ApplicationStatus,
    TechnicianApplication,
    VerificationMethod,
    VerificationOutcome,
    VerificationRecord,
)
from apps.bookings.models import (
    ActorRole,
    Booking,
    BookingDispute,
    BookingStatus,
    BookingStatusHistory,
    Review,
)
from apps.bookings.services import refresh_rating
from apps.catalog.models import ServiceCategory
from apps.core.timeutils import local_tz
from apps.geo.fields import make_point
from apps.geo.services import ensure_placeholder_area
from apps.recommendations.eligibility import distance_km
from apps.recommendations.models import RecommendationSettings
from apps.technicians.models import Availability, AvailabilityState, TechnicianProfile, TechnicianService

ADMIN = ("admin@demo.local", "Admin123!", "Lorna", "Villaruel")
CUSTOMERS = [
    ("customer@demo.local", "Customer123!", "Ana", "Cruz", "09171234567", "Purok 2, Brgy. Poblacion, Kidapawan City", 7.0100, 125.0920),
    ("customer2@demo.local", "Customer123!", "Jose", "Reyes", "09181234567", "Purok 5, Brgy. Lanao, Kidapawan City", 7.0020, 125.0780),
]
TECH_PASSWORD = "Tech123!"

CATEGORIES = [
    ("Aircon Repair", "snowflake", "Cleaning, recharging and repair of window and split-type air conditioners."),
    ("Electrical", "zap", "House wiring, outlets, breakers, lighting and electrical troubleshooting."),
    ("Plumbing", "wrench", "Leaks, clogged drains, faucet and pipe repair, water pump issues."),
    ("Appliance Repair", "washing-machine", "Refrigerators, washing machines, rice cookers and other home appliances."),
    ("Carpentry", "hammer", "Doors, cabinets, furniture repair and small wood construction."),
    ("Computer & Phone Repair", "smartphone", "Laptop, desktop and mobile phone troubleshooting and repair."),
    ("Roofing", "home", "Roof leaks, GI sheet replacement, gutters and ceiling repair."),
    ("Welding", "flame", "Gates, grills, window guards and metal fabrication."),
]

# (first, last, barangay, lat, lng, categories, years, credential)
TECHNICIANS = [
    ("Ramon", "Dela Cruz", "Poblacion", 7.0083, 125.0894, ["Aircon Repair", "Electrical"], 12, "TESDA RAC Servicing NC II"),
    ("Maricel", "Santos", "Lanao", 7.0005, 125.0763, ["Plumbing"], 6, "TESDA Plumbing NC II"),
    ("Joel", "Villanueva", "Sudapin", 7.0175, 125.0955, ["Electrical", "Appliance Repair"], 9, "TESDA EIM NC II"),
    ("Arnel", "Bautista", "Magsaysay", 7.0230, 125.0800, ["Carpentry", "Roofing"], 15, "TESDA Carpentry NC II"),
    ("Rowena", "Garcia", "Balindog", 7.0420, 125.0830, ["Computer & Phone Repair"], 5, "TESDA CSS NC II"),
    ("Edgardo", "Mendoza", "Manongol", 7.0218, 125.1238, ["Welding", "Roofing", "Carpentry"], 18, "TESDA SMAW NC II"),
    ("Liza", "Ramos", "Singao", 7.0050, 125.1150, ["Appliance Repair", "Aircon Repair"], 7, "TESDA RAC Servicing NC II"),
    ("Dennis", "Aquino", "Amas", 7.0200, 125.1000, ["Plumbing", "Electrical"], 4, "TESDA EIM NC II"),
    ("Noel", "Pascual", "Paco", 7.0300, 125.1150, ["Aircon Repair"], 3, "TESDA RAC Servicing NC II"),
    ("Teodoro", "Lumanog", "Ilomavis", 7.0315, 125.2065, ["Plumbing", "Carpentry", "Welding"], 20, "TESDA Plumbing NC II"),
]

EXTRA_APPLICATIONS = [
    ("Mario", "Lim", "mario.lim@demo.local", ApplicationStatus.SUBMITTED, ["Electrical"], None),
    ("Grace", "Tan", "grace.tan@demo.local", ApplicationStatus.UNDER_REVIEW, ["Appliance Repair"], VerificationOutcome.INCONCLUSIVE),
    ("Pedro", "Alonzo", "pedro.alonzo@demo.local", ApplicationStatus.APPROVED, ["Plumbing", "Welding"], VerificationOutcome.VERIFIED),
]

# Completed past bookings: (tech index, customer index, category, weeks ago, rating or None, comment)
COMPLETED = [
    (0, 0, "Aircon Repair", 9, 5, "Very thorough cleaning, aircon is cold again."),
    (0, 1, "Electrical", 6, 4, "Fixed the breaker quickly."),
    (1, 0, "Plumbing", 7, 5, "Leak under the sink is gone. Clean work."),
    (2, 1, "Appliance Repair", 5, 4, "Washing machine works now."),
    (2, 0, "Electrical", 3, 3, "Okay, arrived a bit late."),
    (2, 1, "Electrical", 1, 5, "Explained everything clearly."),
    (4, 0, "Computer & Phone Repair", 4, 4, "Laptop is fast again."),
    (5, 1, "Welding", 8, 5, "Strong and neat gate repair."),
    (5, 0, "Roofing", 2, 5, "No more leaks during the rain."),
    (7, 1, "Plumbing", 2, None, ""),  # completed, not reviewed yet
]


def tech_email(i: int) -> str:
    return f"tech{i + 1}@demo.local"


DEMO_DOMAIN = "@demo.local"


def at(day, hour, minute=0):
    return timezone.make_aware(datetime.combine(day, time(hour, minute)), local_tz())


def next_workday(offset: int):
    """First Mon–Sat date at least `offset` days from today."""
    day = timezone.localdate() + timedelta(days=offset)
    while day.weekday() == 6:
        day += timedelta(days=1)
    return day


class Command(BaseCommand):
    help = "Seed demo users, categories, technicians, availability, bookings, reviews and applications."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete existing demo data before seeding")

    @transaction.atomic
    def handle(self, *args, **opts):
        if opts["reset"]:
            self._reset()
        ensure_placeholder_area()
        RecommendationSettings.load()
        categories = self._categories()
        admin = self._admin()
        customers = self._customers()
        technicians = self._technicians(categories, admin)
        self._availability(technicians)
        self._applications(categories, admin)
        if not Booking.objects.filter(customer__in=customers).exists():
            self._bookings(customers, technicians, categories, admin)
        else:
            self.stdout.write("Demo bookings already exist; skipping (use --reset to recreate).")
        for t in technicians:
            refresh_rating(t.id)
        self.stdout.write(self.style.SUCCESS(
            f"Seeded: {len(categories)} categories, {len(customers)} customers, {len(technicians)} technicians, "
            f"{Booking.objects.count()} bookings, {Review.objects.count()} reviews, "
            f"{TechnicianApplication.objects.count()} applications."
        ))

    # --- pieces -------------------------------------------------------------

    def _reset(self):
        # Every *@demo.local account (seed, extra applicants, smoke-test technicians).
        users = User.objects.filter(email__endswith=DEMO_DOMAIN)
        bookings = Booking.objects.filter(customer__in=users) | Booking.objects.filter(technician__user__in=users)
        ids = list(bookings.values_list("id", flat=True))
        BookingStatusHistory.objects.filter(booking_id__in=ids).delete()
        BookingDispute.objects.filter(booking_id__in=ids).delete()
        Review.objects.filter(booking_id__in=ids).delete()
        Booking.objects.filter(id__in=ids).delete()
        profiles = TechnicianProfile.objects.filter(user__in=users)
        app_ids = list(profiles.exclude(application=None).values_list("application_id", flat=True))
        profiles.delete()
        TechnicianApplication.objects.filter(id__in=app_ids).delete()
        TechnicianApplication.objects.filter(email__endswith=DEMO_DOMAIN).delete()
        users.delete()
        RecommendationSettings.objects.filter(pk=1).update(w_p=0.5, w_r=0.5, d0_km=1.0, no_rating_q=0.5, version=1, is_frozen=False)
        self.stdout.write("Demo data removed.")

    def _categories(self):
        result = {}
        for name, icon, description in CATEGORIES:
            cat, _ = ServiceCategory.objects.get_or_create(name=name, defaults={"icon": icon, "description": description})
            result[name] = cat
        return result

    def _user(self, email, password, first, last, role, phone=""):
        user, created = User.objects.get_or_create(
            email=email, defaults={"first_name": first, "last_name": last, "role": role, "phone": phone}
        )
        user.first_name, user.last_name, user.role, user.is_active = first, last, role, True
        if phone:
            user.phone = phone
        user.set_password(password)  # keep the documented demo password working
        user.save()
        return user

    def _admin(self):
        email, password, first, last = ADMIN
        admin = self._user(email, password, first, last, Role.ADMIN, "09170000001")
        admin.is_superuser = True
        admin.save()
        return admin

    def _customers(self):
        customers = []
        for email, password, first, last, phone, address, lat, lng in CUSTOMERS:
            user = self._user(email, password, first, last, Role.CUSTOMER, phone)
            CustomerProfile.objects.update_or_create(
                user=user, defaults={"default_address": address, "default_location": make_point(lat, lng)}
            )
            customers.append(user)
        return customers

    def _technicians(self, categories, admin):
        profiles = []
        for i, (first, last, brgy, lat, lng, cats, years, credential) in enumerate(TECHNICIANS):
            phone = f"0917{5550100 + i:07d}"
            user = self._user(tech_email(i), TECH_PASSWORD, first, last, Role.TECHNICIAN, phone)
            profile = TechnicianProfile.objects.filter(user=user).first()
            if profile is None:
                app = TechnicianApplication.objects.create(
                    first_name=first, last_name=last, email=user.email, phone=phone,
                    address=f"Brgy. {brgy}, Kidapawan City", notes="Documents submitted in person.",
                    status=ApplicationStatus.APPROVED, recorded_by=admin, decided_by=admin,
                    decided_at=timezone.now() - timedelta(days=90 - i),
                )
                app.requested_categories.set([categories[c] for c in cats])
                VerificationRecord.objects.create(
                    application=app, credential_type=credential, method=VerificationMethod.OFFICIAL_PORTAL,
                    outcome=VerificationOutcome.VERIFIED, checked_on=timezone.localdate() - timedelta(days=95 - i),
                    checked_by=admin, notes="Certificate number matched on the TESDA registry.",
                )
                profile = TechnicianProfile.objects.create(user=user, application=app)
            profile.phone = phone
            profile.address = f"Brgy. {brgy}, Kidapawan City"
            profile.location = make_point(lat, lng)
            profile.years_experience = years
            profile.bio = (
                f"{years} years of experience in {', '.join(c.lower() for c in cats)}. "
                f"Based in Brgy. {brgy}; serves households across Kidapawan City."
            )
            profile.is_approved = True
            profile.save()
            for c in cats:
                TechnicianService.objects.get_or_create(technician=profile, category=categories[c])
            profiles.append(profile)
        return profiles

    def _availability(self, technicians):
        """08:00–17:00 Mon–Sat for the next 21 days (existing slots are left alone)."""
        today = timezone.localdate()
        for t in technicians:
            for offset in range(0, 22):
                day = today + timedelta(days=offset)
                if day.weekday() == 6:
                    continue
                start, end = at(day, 8), at(day, 17)
                if not Availability.objects.filter(technician=t, start__lt=end, end__gt=start).exists():
                    Availability.objects.create(technician=t, start=start, end=end, state=AvailabilityState.AVAILABLE)

    def _applications(self, categories, admin):
        for first, last, email, status, cats, outcome in EXTRA_APPLICATIONS:
            app, created = TechnicianApplication.objects.get_or_create(
                email=email,
                defaults={
                    "first_name": first, "last_name": last, "phone": "09201234567",
                    "address": "Kidapawan City", "notes": "Walk-in applicant; documents checked at the office.",
                    "status": status, "recorded_by": admin,
                },
            )
            if not created:
                continue
            app.requested_categories.set([categories[c] for c in cats])
            if outcome:
                VerificationRecord.objects.create(
                    application=app, credential_type=f"TESDA {cats[0]} NC II",
                    method=VerificationMethod.ISSUING_INSTITUTION if outcome == VerificationOutcome.INCONCLUSIVE
                    else VerificationMethod.OFFICIAL_PORTAL,
                    outcome=outcome, checked_on=timezone.localdate() - timedelta(days=3), checked_by=admin,
                    notes="Awaiting reply from the training center." if outcome == VerificationOutcome.INCONCLUSIVE
                    else "Verified on the TESDA registry.",
                )
            if status == ApplicationStatus.APPROVED:
                app.decided_by, app.decided_at = admin, timezone.now() - timedelta(days=1)
                app.save()

    # --- bookings -------------------------------------------------------------

    def _booking(self, *, customer, tech, category, start, end, status, created_at, notes="", **extra):
        profile = customer.customer_profile
        booking = Booking.objects.create(
            customer=customer, technician=tech, category=category, address=profile.default_address,
            location=profile.default_location, start=start, end=end, status=status, notes=notes,
            distance_km=distance_km(tech, profile.default_location), **extra,
        )
        Booking.objects.filter(pk=booking.pk).update(created_at=created_at)
        return booking

    def _history(self, booking, steps):
        """steps: [(from, to, event, actor, role, reason, when)]"""
        for prev, new, event, actor, role, reason, when in steps:
            h = BookingStatusHistory.objects.create(
                booking=booking, from_status=prev, to_status=new, event=event, actor=actor, actor_role=role, reason=reason
            )
            BookingStatusHistory.objects.filter(pk=h.pk).update(created_at=when)

    def _bookings(self, customers, techs, categories, admin):
        S, R = BookingStatus, ActorRole
        now = timezone.now()

        for ti, ci, cat, weeks, rating, comment in COMPLETED:
            day = timezone.localdate() - timedelta(weeks=weeks) + timedelta(days=ti % 3)
            if day.weekday() == 6:
                day -= timedelta(days=1)
            start = at(day, 9 + (ti % 4) * 2)
            end = start + timedelta(hours=2)
            created = start - timedelta(days=2)
            tech, customer = techs[ti], customers[ci]
            b = self._booking(customer=customer, tech=tech, category=categories[cat], start=start, end=end,
                              status=S.COMPLETED, created_at=created, notes=f"{cat} service request.",
                              started_at=start, completion_requested_at=end - timedelta(minutes=10),
                              completed_at=end, confirmed_by="customer")
            self._history(b, [
                (None, S.PENDING, "created", customer, R.CUSTOMER, "", created),
                (S.PENDING, S.ACCEPTED, "accepted", tech.user, R.TECHNICIAN, "", created + timedelta(hours=3)),
                (S.ACCEPTED, S.IN_PROGRESS, "started", tech.user, R.TECHNICIAN, "", start),
                (S.IN_PROGRESS, S.IN_PROGRESS, "completion_requested", tech.user, R.TECHNICIAN, "", end - timedelta(minutes=10)),
                (S.IN_PROGRESS, S.COMPLETED, "completed", customer, R.CUSTOMER, "", end),
            ])
            if rating:
                review = Review.objects.create(booking=b, rating=rating, comment=comment)
                Review.objects.filter(pk=review.pk).update(created_at=end + timedelta(hours=2))

        ana, jose = customers
        # 1 accepted (Ana, tech1, next workday 10:00)
        day = next_workday(1)
        start = at(day, 10)
        b = self._booking(customer=ana, tech=techs[0], category=categories["Aircon Repair"], start=start,
                          end=start + timedelta(hours=2), status=S.ACCEPTED, created_at=now - timedelta(hours=20),
                          notes="Split-type aircon not cooling; needs cleaning.")
        self._history(b, [
            (None, S.PENDING, "created", ana, R.CUSTOMER, "", now - timedelta(hours=20)),
            (S.PENDING, S.ACCEPTED, "accepted", techs[0].user, R.TECHNICIAN, "", now - timedelta(hours=18)),
        ])

        # 1 pending (Ana, tech2, two workdays ahead 14:00)
        start = at(next_workday(2), 14)
        b = self._booking(customer=ana, tech=techs[1], category=categories["Plumbing"], start=start,
                          end=start + timedelta(hours=2), status=S.PENDING, created_at=now - timedelta(hours=2),
                          notes="Leaking pipe under the kitchen sink.")
        self._history(b, [(None, S.PENDING, "created", ana, R.CUSTOMER, "", now - timedelta(hours=2))])

        # 1 in progress with completion requested (Ana, tech3, started ~1.5 h ago)
        start = (now - timedelta(minutes=90)).replace(second=0, microsecond=0)
        start -= timedelta(minutes=start.minute % 30)
        b = self._booking(customer=ana, tech=techs[2], category=categories["Electrical"], start=start,
                          end=start + timedelta(hours=2), status=S.IN_PROGRESS, created_at=now - timedelta(days=1),
                          notes="Outlet sparks when plugging in.", started_at=start,
                          completion_requested_at=now - timedelta(minutes=10),
                          completion_notes="Replaced the outlet and checked the circuit.")
        self._history(b, [
            (None, S.PENDING, "created", ana, R.CUSTOMER, "", now - timedelta(days=1)),
            (S.PENDING, S.ACCEPTED, "accepted", techs[2].user, R.TECHNICIAN, "", now - timedelta(hours=22)),
            (S.ACCEPTED, S.IN_PROGRESS, "started", techs[2].user, R.TECHNICIAN, "", start),
            (S.IN_PROGRESS, S.IN_PROGRESS, "completion_requested", techs[2].user, R.TECHNICIAN,
             "Replaced the outlet and checked the circuit.", now - timedelta(minutes=10)),
        ])

        # 1 open dispute (Jose, tech4, finished earlier today)
        start = (now - timedelta(hours=4)).replace(second=0, microsecond=0)
        start -= timedelta(minutes=start.minute % 30)
        end = start + timedelta(hours=2)
        b = self._booking(customer=jose, tech=techs[3], category=categories["Roofing"], start=start, end=end,
                          status=S.IN_PROGRESS, created_at=now - timedelta(days=2),
                          notes="Roof leaks above the bedroom.", started_at=start,
                          completion_requested_at=end - timedelta(minutes=5))
        reason = "The roof still leaks after last night's rain."
        self._history(b, [
            (None, S.PENDING, "created", jose, R.CUSTOMER, "", now - timedelta(days=2)),
            (S.PENDING, S.ACCEPTED, "accepted", techs[3].user, R.TECHNICIAN, "", now - timedelta(days=2) + timedelta(hours=1)),
            (S.ACCEPTED, S.IN_PROGRESS, "started", techs[3].user, R.TECHNICIAN, "", start),
            (S.IN_PROGRESS, S.IN_PROGRESS, "completion_requested", techs[3].user, R.TECHNICIAN, "", end - timedelta(minutes=5)),
            (S.IN_PROGRESS, S.IN_PROGRESS, "disputed", jose, R.CUSTOMER, reason, end + timedelta(minutes=30)),
        ])
        BookingDispute.objects.create(booking=b, opened_by=jose, reason=reason)
