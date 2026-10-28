import pytest

from conftest import login
from nexo import main


@pytest.mark.parametrize("mode", ["live", "unavailable"])
def test_runtime_metadata_requires_session_and_does_not_guess_stub(client, monkeypatch, mode):
    async def probe():
        return mode

    monkeypatch.setattr(main, "probe_agent_mode", probe)
    assert client.get("/runtime").status_code == 401
    login(client)
    result = client.get("/runtime")
    assert result.status_code == 200
    assert result.json() == {"mode": mode}
