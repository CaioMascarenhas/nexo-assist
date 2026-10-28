"""Executa jornadas em um projeto Docker isolado, sem usar o modelo pago."""

import argparse
import os
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument(
    "--reset",
    action="store_true",
    help="Recria somente o volume descartável nexo-revisao_nexo-data.",
)
options = parser.parse_args()
root = Path(__file__).resolve().parent.parent
compose = [
    "docker",
    "compose",
    "-p",
    "nexo-revisao",
    "-f",
    "compose.yaml",
    "-f",
    "tests/compose.e2e.yaml",
]
if options.reset:
    subprocess.run([*compose, "down", "-v"], cwd=root, check=True)
subprocess.run([*compose, "up", "-d", "--build", "--wait", "web"], cwd=root, check=True)
subprocess.run(
    ["npm.cmd" if os.name == "nt" else "npm", "run", "test:e2e"],
    cwd=root,
    env={**os.environ, "E2E_URL": "http://localhost:3100"},
    check=True,
)
