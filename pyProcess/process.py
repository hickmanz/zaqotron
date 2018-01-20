import pandas as pd
import numpy as np
import csv
from aiohttp import web
import socketio


def processData():
    forceCsvHeaders = ['Force', 'Unit', 'Time']

    forceStartVal = 0.1
    deflectionStartVal = 0
    torqueArm = 35.0 #always in milimeters
    isTorsion = True 

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

    combinedData.to_csv('combinedout.csv')


def main():
    sio = socketio.AsyncServer()
    app = web.Application()
    sio.attach(app)
    web.run_app(app)

if __name__ == '__main__':
    main()