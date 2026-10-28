from django.urls import path
from rest_framework.routers import SimpleRouter

from apps.accounts import views as accounts
from apps.catalog.views import CategoryViewSet

router = SimpleRouter()
router.register("categories", CategoryViewSet, basename="category")

urlpatterns = [
    path("health/", accounts.HealthView.as_view(), name="health"),
    # auth
    path("auth/register/", accounts.RegisterView.as_view(), name="auth-register"),
    path("auth/token/", accounts.TokenView.as_view(), name="auth-token"),
    path("auth/token/refresh/", accounts.TokenRefreshThrottledView.as_view(), name="auth-token-refresh"),
    path("auth/logout/", accounts.LogoutView.as_view(), name="auth-logout"),
    path("auth/activate/", accounts.ActivateView.as_view(), name="auth-activate"),
    path("auth/me/", accounts.MeView.as_view(), name="auth-me"),
    path("auth/change-password/", accounts.ChangePasswordView.as_view(), name="auth-change-password"),
    path("customers/me/", accounts.CustomerMeView.as_view(), name="customer-me"),
] + router.urls
