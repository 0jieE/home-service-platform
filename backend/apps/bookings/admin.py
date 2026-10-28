from django.contrib import admin

from apps.applications.models import TechnicianApplication, VerificationRecord
from apps.catalog.models import ServiceCategory
from apps.geo.models import CoverageArea
from apps.recommendations.models import RecommendationSettings
from apps.technicians.models import Availability, TechnicianProfile, TechnicianService

from .models import Booking, BookingDispute, BookingStatusHistory, Review


class HistoryInline(admin.TabularInline):
    model = BookingStatusHistory
    extra = 0
    can_delete = False
    readonly_fields = ["from_status", "to_status", "event", "actor", "actor_role", "reason", "created_at"]

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ["id", "status", "customer", "technician", "category", "start", "end"]
    list_filter = ["status", "category"]
    # Status changes go through the API (apps.bookings.services) so history is always written.
    readonly_fields = ["status", "period", "created_at", "updated_at"]
    inlines = [HistoryInline]


admin.site.register(BookingDispute)
admin.site.register(Review)
admin.site.register(ServiceCategory)
admin.site.register(CoverageArea)
admin.site.register(RecommendationSettings)
admin.site.register(TechnicianProfile)
admin.site.register(TechnicianService)
admin.site.register(Availability)
admin.site.register(TechnicianApplication)
admin.site.register(VerificationRecord)
