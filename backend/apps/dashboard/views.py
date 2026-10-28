from datetime import timedelta

from django.db.models import Avg, Count, F, Q
from django.db.models.functions import TruncWeek
from django.utils import timezone
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role, User
from apps.accounts.permissions import IsAdminRole
from apps.applications.models import ApplicationStatus, TechnicianApplication
from apps.bookings.models import Booking, BookingDispute, BookingStatus, DisputeStatus, Review
from apps.core.timeutils import day_start
from apps.technicians.models import TechnicianProfile

WEEKS = 12


class AdminStatsView(APIView):
    permission_classes = [IsAdminRole]

    @extend_schema(responses=inline_serializer("AdminStats", {"totals": serializers.DictField()}))
    def get(self, request):
        technicians = User.objects.filter(role=Role.TECHNICIAN)
        totals = {
            "customers": User.objects.filter(role=Role.CUSTOMER).count(),
            "technicians": technicians.count(),
            "active_technicians": TechnicianProfile.objects.public().count(),
            "pending_applications": TechnicianApplication.objects.filter(
                status__in=[ApplicationStatus.SUBMITTED, ApplicationStatus.UNDER_REVIEW]
            ).count(),
            "bookings": Booking.objects.count(),
            "completed_bookings": Booking.objects.filter(status=BookingStatus.COMPLETED).count(),
            "open_disputes": BookingDispute.objects.filter(status=DisputeStatus.OPEN).count(),
            "avg_rating": Review.objects.aggregate(v=Avg("rating"))["v"],
        }
        if totals["avg_rating"] is not None:
            totals["avg_rating"] = float(totals["avg_rating"])

        counts = dict(Booking.objects.values_list("status").annotate(n=Count("id")).values_list("status", "n"))
        by_status = [{"status": value, "count": counts.get(value, 0)} for value, _ in BookingStatus.choices]

        by_category = [
            {"category": row["category__name"], "count": row["n"]}
            for row in Booking.objects.values("category__name").annotate(n=Count("id")).order_by("-n", "category__name")
        ]

        # Weeks start on Monday (PostgreSQL date_trunc('week')), in Asia/Manila.
        today = timezone.localdate()
        this_monday = today - timedelta(days=today.weekday())
        first_monday = this_monday - timedelta(weeks=WEEKS - 1)
        weekly = dict(
            Booking.objects.filter(created_at__gte=day_start(first_monday))
            .annotate(week=TruncWeek("created_at"))
            .values("week")
            .annotate(n=Count("id"))
            .values_list("week", "n")
        )
        weekly = {timezone.localtime(k).date(): v for k, v in weekly.items()}
        per_week = [
            {"week_start": (first_monday + timedelta(weeks=i)).isoformat(),
             "count": weekly.get(first_monday + timedelta(weeks=i), 0)}
            for i in range(WEEKS)
        ]

        top = (
            TechnicianProfile.objects.select_related("user")
            .annotate(completed=Count("bookings", filter=Q(bookings__status=BookingStatus.COMPLETED)))
            .filter(Q(rating_count__gt=0) | Q(completed__gt=0))
            .order_by(F("rating_avg").desc(nulls_last=True), "-rating_count", "-completed", "id")[:5]
        )
        top_technicians = [
            {"id": t.id, "full_name": t.user.full_name, "rating_avg": t.rating_avg,
             "rating_count": t.rating_count, "completed": t.completed}
            for t in top
        ]
        return Response(
            {
                "totals": totals,
                "bookings_by_status": by_status,
                "bookings_by_category": by_category,
                "bookings_per_week": per_week,
                "top_technicians": top_technicians,
            }
        )
