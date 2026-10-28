"""Check local secrets against tracked files and the generated browser bundle."""

from pathlib import Path
import subprocess

from dotenv import dotenv_values

root = Path(__file__).resolve().parent.parent
values = dotenv_values(root / ".env")
secrets = {
    name: value.encode()
    for name, value in values.items()
    if name in {"GOOGLE_API_KEY", "INTERNAL_AGENT_SECRET"} and value and len(value) > 15
}
tracked = (
    subprocess.check_output(["git", "ls-files", "-z"], cwd=root).decode().split("\0")
)
files = [root / path for path in tracked if path]
files += list((root / "apps/web/.next/static").rglob("*.js"))
leaks = []
for path in files:
    if not path.is_file():
        continue
    data = path.read_bytes()
    for name, value in secrets.items():
        if value in data:
            leaks.append((str(path.relative_to(root)), name))
if leaks:
    for path, name in leaks:
        print(f"Secret detected: {name} in {path}")
    raise SystemExit(1)
print(f"No configured secrets found in {len(files)} tracked files/browser assets.")
