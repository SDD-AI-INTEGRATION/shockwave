FROM python:3.13-slim-bookworm
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libgomp1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt && useradd --create-home worker
RUN mkdir -p /home/worker/.paddlex /home/worker/.paddleocr && chown -R worker:worker /home/worker
COPY worker.py extraction.py .
USER worker
CMD ["python", "worker.py"]
