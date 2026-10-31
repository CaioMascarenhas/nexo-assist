"""Gera o .env privado do deploy sem substituir uma configuração existente."""

import argparse
import os
import re
import secrets
from pathlib import Path
from urllib.parse import urlparse

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--origin", default="https://nexoassist.duckdns.org")
parser.add_argument("--network", default="proxy")
args = parser.parse_args()
origin = urlparse(args.origin)
if (
    origin.scheme != "https"
    or not origin.hostname
    or origin.username
    or origin.password
    or origin.path not in {"", "/"}
    or origin.query
    or origin.fragment
):
    parser.error(
        "Informe somente uma origem HTTPS, sem caminho, credenciais ou parâmetros."
    )
if not re.fullmatch(r"[A-Za-z0-9_.-]+", args.network):
    parser.error("Nome de rede Docker inválido.")
root = Path(__file__).resolve().parent.parent
target = root / ".env"
if target.exists():
    print(".env existente preservado. Nenhum segredo foi substituído.")
else:
    content = (root / "deploy/.env.example").read_text(encoding="utf-8")
    content = content.replace(
        "replace-with-a-generated-database-password", secrets.token_hex(32)
    )
    content = content.replace(
        "replace-with-a-generated-internal-secret", secrets.token_hex(48)
    )
    content = content.replace("https://nexoassist.duckdns.org", args.origin.rstrip("/"))
    content = content.replace("PROXY_NETWORK=proxy", f"PROXY_NETWORK={args.network}")
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        stream.write(content)
    print(
        ".env de deploy criado com segredos aleatórios e modo stub. Configure a chave para usar live."
    )
