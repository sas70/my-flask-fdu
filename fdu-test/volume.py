# calculate the volume of a sphere
import math
import os
import sys

from flask import Flask, render_template, request

# Default 5001: on macOS Monterey+, AirPlay Receiver often uses TCP port 5000 and
# can answer with HTTP 403 in the browser while Flask competes for the same port.
DEFAULT_PORT = int(os.environ.get("PORT", "5001"))

app = Flask(__name__)


def volume_of_sphere(radius):
    return (4 / 3) * math.pi * radius**3


@app.route("/", methods=["GET", "POST"])
def index():
    volume = None
    radius_value = None
    error = None
    radius_input = ""
    if request.method == "POST":
        radius_input = request.form.get("radius", "").strip()
        try:
            r = float(radius_input)
            if r < 0:
                error = "Radius must be non-negative."
            else:
                radius_value = r
                volume = volume_of_sphere(r)
        except ValueError:
            error = "Please enter a valid number."
    return render_template(
        "index.html",
        volume=volume,
        radius=radius_value,
        radius_input=radius_input,
        error=error,
    )


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--cli":
        radius = float(input("Enter the radius of the sphere: "))
        print(f"The volume of the sphere is {volume_of_sphere(radius)}")
    else:
        print(
            f"\n  Open in your browser: http://127.0.0.1:{DEFAULT_PORT}/\n"
            "  If you see HTTP 403: use Safari or Chrome (not the IDE preview), "
            "or disable AirPlay Receiver if it still uses port 5000 (System Settings).\n"
        )
        app.run(debug=True, host="127.0.0.1", port=DEFAULT_PORT)
