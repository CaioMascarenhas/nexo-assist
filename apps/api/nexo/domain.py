from datetime import datetime, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo

from .config import settings

Priority = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]
CATEGORIES = {"Acesso", "Rede e VPN", "Hardware", "Software", "E-mail", "Outros"}


def aware(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def priority_for(scope: str, blocked: bool, same_day: bool, workaround: bool) -> Priority:
    if scope in {"team", "company"} and blocked:
        return "CRITICAL"
    if blocked or same_day:
        return "HIGH"
    if workaround:
        return "MEDIUM"
    return "LOW"


def due_at(start: datetime, priority: str) -> datetime:
    if priority == "CRITICAL":
        return aware(start) + timedelta(hours=1)
    remaining = {"HIGH": 240, "MEDIUM": 1800, "LOW": 3000}[priority]
    local = aware(start).astimezone(ZoneInfo(settings.service_desk_timezone))
    while remaining:
        if local.weekday() >= 5 or local.hour >= 18:
            local = (local + timedelta(days=1)).replace(hour=8, minute=0, second=0, microsecond=0)
            continue
        if local.hour < 8:
            local = local.replace(hour=8, minute=0, second=0, microsecond=0)
        end = local.replace(hour=18, minute=0, second=0, microsecond=0)
        available = (end - local).total_seconds() / 60
        consumed = min(remaining, available)
        local += timedelta(minutes=consumed)
        remaining -= consumed
    return local.astimezone(timezone.utc)


def can_reopen(resolved_at: datetime | None, instant: datetime) -> bool:
    return resolved_at is not None and timedelta(0) <= aware(instant)-aware(resolved_at) <= timedelta(days=7)


def overdue(status: str, due: datetime, instant: datetime) -> bool:
    return status not in {"RESOLVED", "CLOSED"} and aware(instant) > aware(due)
