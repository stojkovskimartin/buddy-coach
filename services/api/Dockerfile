# Production-style image for the Buddy Coach API.
FROM python:3.13-slim AS base
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /uvx /bin/
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1

# Dependencies first, so code changes do not reinstall them.
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src ./src
COPY alembic ./alembic
COPY alembic.ini ./
RUN uv sync --frozen --no-dev

# Runs as an unprivileged user; the app only reads its files and writes photos to /app/media.
RUN useradd --system --no-create-home app \
    && mkdir /app/media && chown app /app/media
USER app
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health/live')"
# Migrations run on start so a fresh database is always up to date.
CMD ["sh", "-c", "alembic upgrade head && uvicorn buddy_coach.main:app --host 0.0.0.0 --port 8000"]
