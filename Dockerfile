FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends gcc g++ make && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt && apt-get purge -y gcc g++ make && apt-get autoremove -y
COPY vedic.py app.py ./
EXPOSE 10000
# Render gives the port in $PORT. One worker is enough for one owner (and keeps Swiss Ephemeris state safe).
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1"]
