import socket

from flask import Flask
from flask_cors import CORS

from routes.api import api_bp
from routes.pages import pages_bp


socket.getfqdn = lambda name="": "localhost"


def create_app():
    app = Flask(__name__)
    app.config["TEMPLATES_AUTO_RELOAD"] = True
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
    CORS(app)
    app.register_blueprint(pages_bp)
    app.register_blueprint(api_bp)
    return app


if __name__ == "__main__":
    create_app().run(debug=False, host="127.0.0.1", port=5000, use_reloader=False)
