from rest_framework.permissions import BasePermission

from .models import Role


class _RolePermission(BasePermission):
    role: str = ""
    message = "You do not have permission for this action."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and user.role == self.role)


class IsCustomer(_RolePermission):
    role = Role.CUSTOMER
    message = "Only customers can do this."


class IsTechnician(_RolePermission):
    role = Role.TECHNICIAN
    message = "Only technicians can do this."


class IsAdminRole(_RolePermission):
    role = Role.ADMIN
    message = "Only administrators can do this."


class IsBookingParticipant(BasePermission):
    """Object-level: customer of the booking, assigned technician, or an admin."""

    message = "You are not a participant of this booking."

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.role == Role.ADMIN:
            return True
        if user.role == Role.CUSTOMER:
            return obj.customer_id == user.id
        if user.role == Role.TECHNICIAN:
            return obj.technician.user_id == user.id
        return False
