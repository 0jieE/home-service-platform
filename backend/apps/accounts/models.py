from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.contrib.gis.db import models
from django.utils import timezone


class Role(models.TextChoices):
    CUSTOMER = "customer", "Customer"
    TECHNICIAN = "technician", "Technician"
    ADMIN = "admin", "Administrator"


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("role", Role.CUSTOMER)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra["role"] = Role.ADMIN
        extra["is_superuser"] = True
        return self._create_user(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    """Email is the login. Role decides which part of the platform the user can use."""

    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.CUSTOMER, db_index=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        ordering = ["id"]

    def save(self, *args, **kwargs):
        self.email = (self.email or "").strip().lower()
        # Admin role always gets Django admin access; other roles never do.
        self.is_staff = self.role == Role.ADMIN
        super().save(*args, **kwargs)

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip() or self.email

    @property
    def short_name(self) -> str:
        """'Ana C.' — used for public review attribution."""
        if self.first_name:
            initial = f" {self.last_name[:1]}." if self.last_name else ""
            return f"{self.first_name}{initial}"
        return self.email.split("@")[0]

    def __str__(self):
        return f"{self.email} ({self.role})"


class CustomerProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="customer_profile")
    default_address = models.CharField(max_length=255, blank=True)
    default_location = models.PointField(geography=True, srid=4326, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"CustomerProfile<{self.user.email}>"


class ActivationCode(models.Model):
    """One-time technician activation code. Only the hash is stored; the plain code is shown once."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="activation_codes")
    code_hash = models.CharField(max_length=255)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    @staticmethod
    def normalize(code: str) -> str:
        return "".join(ch for ch in (code or "").upper() if ch.isalnum())

    def set_code(self, plain: str) -> None:
        self.code_hash = make_password(self.normalize(plain))

    def matches(self, plain: str) -> bool:
        return check_password(self.normalize(plain), self.code_hash)

    @property
    def is_usable(self) -> bool:
        return self.used_at is None and self.expires_at > timezone.now()
