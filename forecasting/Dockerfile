# Forecasting sidecar — PRD-12. Multi-stage Python 3.12 build.

FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Prophet wheels need cmdstan + a real C++ compiler at install time on
# some platforms — slim+gcc covers it.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (cached layer)
COPY pyproject.toml ./
RUN pip install --upgrade pip && pip install --no-deps "fastapi>=0.115" "uvicorn[standard]>=0.32" "psycopg[binary]>=3.2" "prophet>=1.1.6" "pandas>=2.2" "numpy>=1.26" "pydantic>=2.9" "python-dotenv>=1.0" "sentry-sdk>=2.18"
# Resolving deps separately would be cleaner but Prophet's pin chain
# is finicky; the explicit list above matches pyproject.toml.

COPY app ./app

EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
