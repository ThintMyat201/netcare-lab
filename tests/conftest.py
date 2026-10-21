import os
import sys
from pathlib import Path

# core.py reads DB_NAME when it is first imported, and load_dotenv never overrides a variable
# that is already set. Setting it here, before any test module imports the backend, keeps
# every test away from the app's own database.
os.environ["DB_NAME"] = "netcare_test"

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
