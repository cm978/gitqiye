from app import create_app


def test_longzu_index_is_served_from_flask_origin():
    client = create_app().test_client()

    response = client.get("/longzu-site/")

    assert response.status_code == 200
    assert "龙族 | Longzu" in response.get_data(as_text=True)


def test_longzu_assets_are_served_from_flask_origin():
    client = create_app().test_client()

    response = client.get("/longzu-site/script.js")

    assert response.status_code == 200
    assert "archiveTransition" in response.get_data(as_text=True)
