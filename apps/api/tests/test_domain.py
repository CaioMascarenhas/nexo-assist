from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from nexo.domain import can_reopen, due_at, overdue, priority_for

TZ = ZoneInfo("America/Fortaleza")


@pytest.mark.parametrize(
    "scope,blocked,today,alternative,expected",
    [
        ("team", True, False, False, "CRITICAL"),
        ("individual", True, False, False, "HIGH"),
        ("individual", False, True, False, "HIGH"),
        ("individual", False, False, True, "MEDIUM"),
        ("individual", False, False, False, "LOW"),
        ("team", False, False, True, "MEDIUM"),
    ],
)
def test_priority(scope, blocked, today, alternative, expected):
    assert priority_for(scope, blocked, today, alternative) == expected


@pytest.mark.parametrize("priority,day,hour", [("HIGH", 26, 11), ("MEDIUM", 28, 17), ("LOW", 30, 17)])
def test_business_time_skips_weekend(priority, day, hour):
    start = datetime(2026, 10, 23, 17, tzinfo=TZ)
    assert due_at(start, priority).astimezone(TZ) == datetime(2026, 10, day, hour, tzinfo=TZ)


def test_critical_24_hours_and_deadline_boundary():
    start = datetime(2026, 10, 23, 23, 30, tzinfo=TZ)
    deadline = due_at(start, "CRITICAL")
    assert deadline.astimezone(TZ) == datetime(2026, 10, 24, 0, 30, tzinfo=TZ)
    assert not overdue("OPEN", deadline, deadline)
    assert overdue("OPEN", deadline, deadline + timedelta(seconds=1))
    assert not overdue("RESOLVED", deadline, deadline + timedelta(days=10))


def test_reopen_window_inclusive():
    instant = datetime(2026, 10, 27, 12, tzinfo=TZ)
    assert can_reopen(instant - timedelta(days=7), instant)
    assert not can_reopen(instant - timedelta(days=7, seconds=1), instant)
    assert not can_reopen(instant + timedelta(seconds=1), instant)
