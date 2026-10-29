FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# GeoDjango needs the GDAL / GEOS / PROJ runtime libraries (pulled in by gdal-bin; no -dev headers needed);
# postgresql-client gives pg_dump / pg_restore.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gdal-bin binutils postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# Production image (Render) installs runtime deps only; docker compose passes REQUIREMENTS=requirements-dev.txt.
ARG REQUIREMENTS=requirements.txt
COPY requirements.txt requirements-dev.txt ./
RUN pip install -r ${REQUIREMENTS}

COPY . .

# Hashed static files for django-admin / Swagger UI, served by WhiteNoise. No database needed.
RUN DEBUG=False DJANGO_SECRET_KEY=collectstatic-only python manage.py collectstatic --noinput

EXPOSE 8000
# Render overrides this with `sh scripts/start.sh` (migrate + daphne + celery worker/beat).
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "config.asgi:application"]
