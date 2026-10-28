FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY apps/api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/api .
RUN useradd --create-home nexo
USER nexo
EXPOSE 8000
CMD ["uvicorn", "nexo.main:app", "--host", "0.0.0.0", "--port", "8000"]
