"""Create local secrets once; never overwrite an existing environment file."""
from pathlib import Path
import secrets

root = Path(__file__).resolve().parent.parent
target = root / ".env"
if target.exists():
    print(".env already exists; preserved.")
else:
    source = (root / ".env.example").read_text(encoding="utf-8")
    source = source.replace("replace-with-a-random-secret-at-least-32-characters", secrets.token_urlsafe(48))
    target.write_text(source, encoding="utf-8")
    print("Created local .env with a random internal secret; LLM_MODE=stub.")
