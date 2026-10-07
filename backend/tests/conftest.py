import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

TEST_DB = BACKEND / "tests" / "test.db"
if TEST_DB.exists():
    TEST_DB.unlink()

os.environ["APP_ENV"] = "development"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["SESSION_SECRET"] = "test-secret"
os.environ["LLM_PROVIDER"] = "mock"
os.environ["FRONTEND_DIST"] = str(BACKEND / "tests" / "no-such-dist")
