# app.py
from flask import Flask, render_template
from calculate import calculate_app
from tle import tle_bp
import configparser

app = Flask(__name__)
app.register_blueprint(calculate_app)
app.register_blueprint(tle_bp)

@app.route('/')
def index():
    return render_template('index.html')

config = configparser.ConfigParser()
config.read('config.ini')

debug = config.getboolean('App', 'debug', fallback=True)
port = config.getint('App', 'port', fallback=5000)
host = config.get('App', 'host', fallback='0.0.0.0')

if __name__ == '__main__':
    app.run(debug=debug, port=port, host=host)
