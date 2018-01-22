from engineio import async_threading
import pandas as pd
import numpy as np
import csv
import threading
import time
from flask import Flask, render_template
import socketio
import os

async_mode = 'threading'

sio = socketio.Server(logger=True, async_mode=async_mode)
app = Flask(__name__)
app.wsgi_app = socketio.Middleware(sio, app.wsgi_app)
app.config['SECRET_KEY'] = 'secret!'
thread = None


def background_thread():
    """Example of how to send server generated events to clients."""
    count = 0
    while True:
        sio.sleep(10)
        count += 1
        sio.emit('my response', {'data': 'Server generated event'},
                 namespace='/test')


@app.route('/')
def index():
    global thread
    if thread is None:
        thread = sio.start_background_task(background_thread)
    return render_template('index.html')

@sio.on('start-process', namespace='/proc')
def addData(sid, message):
    sio.emit('logMessage', {'data': 'Data recieved from client', 'extra' : message}, namespace='/test')
    processData(message, sid)

@sio.on('my broadcast event', namespace='/test')
def test_broadcast_message(sid, message):
    sio.emit('my response', {'data': message['data']}, namespace='/test')

@sio.on('connect', namespace='/proc')
def test_connect(sid, environ):
    sio.emit('my response', {'data': 'Connected', 'count': 0}, room=sid,
             namespace='/test')


@sio.on('disconnect', namespace='/proc')
def test_disconnect(sid):
    print('Client disconnected')



def processData(message, sid):
    dataDir = message['dir']
    forcePath = message['forceFile']
    sio.emit('logMessage', {'data': 'ForcePath', 'extra' :forcePath}, namespace='/test')
    deflectionPath = message['deflectionFile']
    forceStartVal = message['forceStartVal']
    combinedPath = message['combinedFile']
    testName = message['testName']
    deflectionStartVal = 0
    if message['type'] == "torsion":
        isTorsion = True
        torqueArm = message['torqueArmLng']
    else:
        isTorsion = False

    forceData = pd.read_csv(forcePath, usecols=[0,1])
    print(forceData)
    trimStart = forceData.index[forceData['Force'] > forceStartVal].tolist()

    toDrop = []

    for i in range(0,trimStart[0]-1):
        toDrop.append(i)

    forceData = forceData.drop(toDrop)

    trimEnd = forceData.index[forceData['Force'] <= forceStartVal].tolist()
    trimEnd.pop(0)
    trimEnd.pop(0)

    forceData = forceData.drop(trimEnd)

    forceData.index = range(len(forceData))

    deflectionData = pd.read_csv(deflectionPath, usecols=[0,1])

    trimStart = deflectionData.index[deflectionData['Deflection'] > deflectionStartVal].tolist()

    toDrop = []

    for i in range(0,trimStart[0]-1):
        toDrop.append(i)

    deflectionData = deflectionData.drop(toDrop)
    deflectionData.index = range(len(deflectionData))

    timeOffset = np.round(deflectionData['Time'][0], decimals=8) - forceData['Time'][0]

    deflectionData['Time'] = np.round(deflectionData['Time'], decimals=8) - timeOffset

    deflectionData['Time'][0] = forceData['Time'][0]

    forceData.index = forceData['Time']
    deflectionData.index = deflectionData['Time']

    combinedData = deflectionData.join(forceData, how='outer', rsuffix = '_2')

    combinedData = combinedData.drop(['Time', 'Time_2'], axis=1)

    combinedData = combinedData.interpolate()

    trimEnd = combinedData.index[combinedData['Force'] <= forceStartVal].tolist()
    trimEnd.pop(0)
    trimEnd.pop(0)

    combinedData = combinedData.drop(trimEnd)

    if isTorsion:
        combinedData['Angle'] = np.degrees(np.arctan(combinedData['Deflection']/torqueArm))
        combinedData['Torque'] = combinedData['Force'] * (torqueArm*0.0393701)
    
    sio.emit('logMessage', {'data': 'combined created', 'extra' : combinedPath}, namespace='/test')
    combinedData.to_csv(combinedPath)

    #PASS FILE LOCATION
    sio.emit('proc-finished', {'combinedPath': combinedPath, 'forcePath' : forcePath, 'deflectionPath': deflectionPath, 'testName':testName}, room=sid, namespace='/proc')
    

if __name__ == '__main__':
    app.run(threaded=True)