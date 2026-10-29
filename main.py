"""
Root entrypoint re-exporting the existing FastAPI `app` from `backend.main`.
Allows Render to start the server using either:
- `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- `uvicorn main:app --host 0.0.0.0 --port $PORT`
"""

from backend.main import app  # noqa: F401
