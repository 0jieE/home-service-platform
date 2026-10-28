from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.accounts import views as accounts
from apps.applications.views import AdminUserViewSet, ApplicationViewSet
from apps.bookings.views import AdminDisputeViewSet, BookingViewSet
from apps.catalog.views import CategoryViewSet
from apps.dashboard.views import AdminStatsView
from apps.geo import views as geo
from apps.recommendations.views import AdminRecommendationSettingsView, RecommendationView
from apps.technicians.views import MyAvailabilityViewSet, TechnicianMeView, TechnicianViewSet

router = SimpleRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("technicians/me/availability", MyAvailabilityViewSet, basename="my-availability")
router.register("technicians", TechnicianViewSet, basename="technician")
router.register("bookings", BookingViewSet, basename="booking")
router.register("admin/applications", ApplicationViewSet, basename="admin-application")
router.register("admin/users", AdminUserViewSet, basename="admin-user")
router.register("admin/disputes", AdminDisputeViewSet, basename="admin-dispute")

urlpatterns = [
    path("health/", accounts.HealthView.as_view(), name="health"),
    path("config/", geo.ConfigView.as_view(), name="config"),
    path("coverage/", geo.CoverageView.as_view(), name="coverage"),
    path("coverage/check/", geo.CoverageCheckView.as_view(), name="coverage-check"),
    # auth
    path("auth/register/", accounts.RegisterView.as_view(), name="auth-register"),
    path("auth/token/", accounts.TokenView.as_view(), name="auth-token"),
    path("auth/token/refresh/", accounts.TokenRefreshThrottledView.as_view(), name="auth-token-refresh"),
    path("auth/logout/", accounts.LogoutView.as_view(), name="auth-logout"),
    path("auth/activate/", accounts.ActivateView.as_view(), name="auth-activate"),
    path("auth/me/", accounts.MeView.as_view(), name="auth-me"),
    path("auth/change-password/", accounts.ChangePasswordView.as_view(), name="auth-change-password"),
    # profiles
    path("customers/me/", accounts.CustomerMeView.as_view(), name="customer-me"),
    path("technicians/me/", TechnicianMeView.as_view(), name="technician-me"),
    # recommendations
    path("recommendations/", RecommendationView.as_view(), name="recommendations"),
    # admin
    path("admin/stats/", AdminStatsView.as_view(), name="admin-stats"),
    path("admin/recommendation-settings/", AdminRecommendationSettingsView.as_view(), name="admin-rec-settings"),
    path("admin/coverage/", geo.AdminCoverageView.as_view(), name="admin-coverage"),
] + router.urls
