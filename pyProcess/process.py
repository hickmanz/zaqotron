from engineio import async_threading
import pandas as pd
import numpy as np
import csv
import threading
import time
from sys import argv
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

    #figure out which values are greater than start value
    trimStart = forceData.index[forceData['Force'] > forceStartVal].tolist() 
    toDrop = [] 
    for i in range(0,trimStart[0]-1):
        toDrop.append(i)    
    forceData = forceData.drop(toDrop)  #drop values before last example of start value
    # do reverse to trim end data
    trimEnd = forceData.index[forceData['Force'] <= forceStartVal].tolist()
    trimEnd.pop(0)
    trimEnd.pop(0)
    forceData = forceData.drop(trimEnd) #trim end of force data
    forceData.index = range(len(forceData)) # reindex trimmed force data

    deflectionData = pd.read_csv(deflectionPath, usecols=[0,1])

    #deflecton trim start values
    trimStart = deflectionData.index[deflectionData['Deflection'] > deflectionStartVal].tolist() 
    toDrop = []
    for i in range(0,trimStart[0]-1):
        toDrop.append(i)
    deflectionData = deflectionData.drop(toDrop)
    deflectionData.index = range(len(deflectionData))

    #split both time series in half at mid of observed max
    #determine max - find where it exists - split by index
    deflectionIsMax = deflectionData.index[deflectionData['Deflection'] == deflectionData.max()['Deflection']].tolist() 
    deflectionIsMax = findMiddle(deflectionIsMax) #middle index of max value appearances
    print(deflectionIsMax)
    forceIsMax = forceData.index[forceData['Force'] == forceData.max()['Force']].tolist() 
    forceIsMax = findMiddle(forceIsMax) #middle index of max value appearances
    print(forceIsMax)

    forceTopData = forceData.iloc[:forceIsMax]
    forceBottomData = forceData.iloc[forceIsMax:]
    forceBottomData.index = range(len(forceBottomData))
    deflectionTopData = deflectionData.iloc[:deflectionIsMax]
    deflectionBottomData = deflectionData.iloc[deflectionIsMax:]
    deflectionBottomData.index = range(len(deflectionBottomData))
    #do same thing with each half and then combine
    #TOP PROCESS

    timeTopOffset = np.round(deflectionTopData['Time'][len(deflectionTopData.index)-1], decimals=8) - forceTopData['Time'][len(forceTopData.index)-1] # determine differnce in time between two sets start
    deflectionTopData['Time'] = np.round(deflectionTopData['Time'], decimals=8) - timeTopOffset #reset deflection time stamp based on time offset

    forceTopData.index = forceTopData['Time']
    deflectionTopData.index = deflectionTopData['Time']

    combinedTopData = deflectionTopData.join(forceTopData, how='outer', rsuffix = '_2')
    combinedTopData = combinedTopData.drop(['Time', 'Time_2'], axis=1)
    combinedTopData = combinedTopData.interpolate()

    #BOTTOM PROCESS
    timeBottomOffset = np.round(deflectionBottomData['Time'][0], decimals=8) - forceBottomData['Time'][0]
    deflectionBottomData['Time'] = np.round(deflectionBottomData['Time'], decimals=8) - timeBottomOffset #reset deflection time stamp based on time offset

    forceBottomData.index = forceBottomData['Time']
    deflectionBottomData.index = deflectionBottomData['Time']
    

    combinedBottomData = deflectionBottomData.join(forceBottomData, how='outer', rsuffix = '_2')
    combinedBottomData = combinedBottomData.drop(['Time', 'Time_2'], axis=1)
    combinedBottomData = combinedBottomData.interpolate()
 
    pieces = (combinedTopData, combinedBottomData)
    combinedData = pd.concat(pieces, ignore_index=True)
    
    trimEnd = combinedData.index[combinedData['Force'] <= forceStartVal].tolist()
    trimEnd.pop(0)
    trimEnd.pop(0)
    combinedData = combinedData.drop(trimEnd)

    forceNan = combinedData.index[combinedData['Force'].apply(np.isnan)].tolist() 
    deflectionNan = combinedData.index[combinedData['Deflection'].apply(np.isnan)].tolist() 

    if len(forceNan) > 0:
        editIndex = forceNan[len(forceNan)-1]+1
        combinedData = combinedData.iloc[editIndex:]
        deflectionOffset = combinedData['Deflection'][editIndex]
        combinedData['Deflection'] = np.round(combinedData['Deflection'], decimals=8) - deflectionOffset
        combinedData['Force'][editIndex] = 0


    if len(deflectionNan) > 0:
        editIndex = deflectionNan[len(deflectionNan)-1]+1
        combinedData = combinedData.iloc[editIndex:]
        combinedData['Force'][editIndex] = 0

    if isTorsion:
        combinedData['Angle'] = np.degrees(np.arctan(combinedData['Deflection']/torqueArm))
        combinedData['Torque'] = combinedData['Force'] * (torqueArm*0.0393701)
    
    sio.emit('logMessage', {'data': 'combined created', 'extra' : combinedPath}, namespace='/test')
    combinedData.to_csv(combinedPath)

    #PASS FILE LOCATION
    if '-d' in myargs:
        print('finished')
    else :
        sio.emit('proc-finished', {'combinedPath': combinedPath, 'forcePath' : forcePath, 'deflectionPath': deflectionPath, 'testName':testName}, room=sid, namespace='/proc')
        sio.emit('test', {'combinedPath': combinedPath, 'forcePath' : forcePath, 'deflectionPath': deflectionPath, 'testName':testName, 'combinedData': combinedData, 'combinedDataBottom': combinedData.iloc[findMiddle(combinedData.index[combinedData['Force'] == combinedData.max()['Force']].tolist()):]}, room=sid, namespace='/proc')

def startTest(dir):
    message = {
        'dir': dir['-d'],
        'forceFile': dir['-d'] + 'force.csv',
        'deflectionFile': dir['-d'] + 'deflection.csv',
        'forceStartVal': .2,
        'combinedFile': dir['-d'] + 'combined.csv',
        'testName': 'test',
        'type': 'compression'
    }
    processData(message, 0)

def findMiddle(input_list):
    middle = float(len(input_list))/2
    if middle % 2 != 0:
        return input_list[int(middle - .5)]
    else:
        return input_list[int(middle)]

def getopts(argv):
    opts = {}  # Empty dictionary to store key-value pairs.
    while argv:  # While there are arguments left to parse...
        if argv[0][0] == '-':  # Found a "-name value" pair.
            opts[argv[0]] = argv[1]  # Add key and value to the dictionary.
        argv = argv[1:]  # Reduce the argument list by copying it starting from index 1.
    return opts

if __name__ == '__main__':
    myargs = getopts(argv)
    if '-d' in myargs:
        print(myargs)
        startTest(myargs)
    else :
        app.run(threaded=True)
