from conftest import login


def test_session_and_ownership(client):
    assert client.get("/conversations").status_code == 401
    login(client)
    created = client.post("/conversations").json()
    assert client.get(f"/conversations/{created['id']}").status_code == 200
    login(client, "bob")
    assert client.get(f"/conversations/{created['id']}").status_code == 404
    assert client.post(f"/conversations/{created['id']}/handoff").status_code == 404
    assert client.get("/conversations").json() == []


def test_unknown_email_logout_and_cookie_flags(client):
    assert client.post("/auth/login", json={"email":"nobody@nexo.com.br", "password":"x"}).status_code == 401
    login(client)
    assert client.get("/me").json()["role"] == "EMPLOYEE"
    assert client.post("/auth/logout").status_code == 200
    assert client.get("/me").status_code == 401


def test_foreign_origin_rejected(client):
    response = client.post("/auth/login", json={"email":"alice@nexo.com.br", "password":"x"},
                           headers={"origin":"https://attacker.invalid"})
    assert response.status_code == 403
