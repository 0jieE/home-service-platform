FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# GeoDjango needs GDAL / GEOS / PROJ; postgresql-client gives pg_dump / pg_restore.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gdal-bin libgdal-dev libgeos-dev libproj-dev binutils postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "config.asgi:application"]
