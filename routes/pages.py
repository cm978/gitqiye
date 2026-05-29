from pathlib import Path

from flask import Blueprint, render_template, send_from_directory

pages_bp = Blueprint("pages", __name__)
LONGZU_SITE_DIR = Path(__file__).resolve().parents[2] / "longzu-site"


@pages_bp.get("/")
def index():
    return render_template("index.html")


@pages_bp.get("/longzu-site/")
def longzu_index():
    return send_from_directory(LONGZU_SITE_DIR, "index.html")


@pages_bp.get("/longzu-site/<path:filename>")
def longzu_asset(filename):
    return send_from_directory(LONGZU_SITE_DIR, filename)
