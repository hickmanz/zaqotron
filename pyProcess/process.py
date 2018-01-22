from engineio import async_threading
import pandas as pd
import numpy as np
import csv
import threading
import time
from flask import Flask, render_template
import socketio

async_mode = 'threading'

sio = socketio.Server(logger=True, async_mode=async_mode)
app = Flask(__name__)
app.wsgi_app = socketio.Middleware(sio, app.wsgi_app)
app.config['SECRET_KEY'] = 'secret!'
thread = None

forceCsvHeaders = ['Force', 'Unit', 'Time']

dataDir = ""
forceStartVal = 0.1
deflectionStartVal = 0
torqueArm = 35.0 #always in milimeters
isTorsion = True 

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
    sio.emit('logMessage', {'data': 'Data recieved from client'}, namespace='/test')
    #update variables
    processData(sid)

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



def processData():

    forceData = pd.read_csv('force.csv', skiprows=6, header=None, names=forceCsvHeaders, usecols=[1,2,3])

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

    deflectionData = pd.read_csv('deflection.csv', usecols=[1,2])

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

    combinedData = combinedData.drop(columns=['Time', 'Time_2', 'Unit'])

    combinedData = combinedData.interpolate()

    trimEnd = combinedData.index[combinedData['Force'] <= forceStartVal].tolist()
    trimEnd.pop(0)
    trimEnd.pop(0)

    combinedData = combinedData.drop(trimEnd)

    if isTorsion:
        combinedData['Angle'] = np.degrees(np.arctan(combinedData['Deflection']/torqueArm))
        combinedData['Torque'] = combinedData['Force'] * (torqueArm*0.0393701)
    
    combinedData.to_csv('processed-data.csv')

    #PASS FILE LOCATION
    sio.emit('proc-finished', {'data': message['data']}, room=sid,
            namespace='/proc')
    

if __name__ == '__main__':
    app.run(threaded=True)