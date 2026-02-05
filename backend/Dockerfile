FROM python:3.13-slim

WORKDIR /app

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install uv
RUN pip install --no-cache-dir uv

# Install to system Python (no venv)
ENV UV_PROJECT_ENVIRONMENT=/usr/local
RUN uv sync --frozen --no-dev

# Copy application code
COPY . .

EXPOSE 8000

CMD ["uvicorn", "application.main:app", "--host", "0.0.0.0", "--port", "8000"]