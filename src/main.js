 //handle setupevents as quickly as possible
 const setupEvents = require('./setupEvents')
 if (setupEvents.handleSquirrelEvent()) {
    // squirrel event handled and app will exit in 1000ms, so don't do anything else
 }
 
const electron = require('electron')
// Module to control application life.
const app = electron.app
// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow

const parseArgs = require('electron-args');
const path = require('path');
const url = require('url');
const fs = require('fs');

const {appUpdater} = require('./autoupdater');
const isDev = require('electron-is-dev');
var opts = parseArgs();
// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow
let progressWin
var windowArray = [];

function createMainWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({width: 800, height: 600, frame: false, show: false });
  mainWindow.name = "mainWindow";  
  windowArray.push(mainWindow);
  mainWindow.setMenu(null);
  // and load the index.html of the app.
  mainWindow.webContents.on('did-finish-load', ()=>{
    mainWindow.show();
    mainWindow.focus();
  });
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }))
  if (!isDev) {
    mainWindow.webContents.openDevTools()
  }
  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
    removeWindow('mainWindow');
  })
}
function createProgressWindow(){
  const modalPath = path.join( __dirname, './sections/progress.html')
  progressWin = new BrowserWindow({width: 400, height: 200, frame: false, show: false })
  progressWin.name = "progressWin";
  windowArray.push(progressWin);
  progressWin.on('closed', function () { 
    progressWin = null;
    removeWindow('progressWin');
  })
  progressWin.webContents.on('did-finish-load', ()=>{
    progressWin.show();
    progressWin.focus();
  });
  progressWin.loadURL(modalPath)
  progressWin.show()
}

function getWindow(windowName) {
  for (var i = 0; i < windowArray.length; i++) {
    if (windowArray[i].name == windowName) {
      return windowArray[i].window;
    }
  }
  return null;
}

function removeWindow(windowName){
  for (var i = 0; i < windowArray.length; i++) {
    if (windowArray[i].name == windowName) {
      windowArray.splice(i, 1);
    }
  }
}
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', function () {
  const settings = require('electron-settings');
  
  if(opts.input[0]){
    createProgressWindow();
  } else {
    createMainWindow();
  }

  if (!isDev) {
    appUpdater();
  }
});
// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
      createMainWindow();

})
// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
const ipc = require('electron').ipcMain
const dialog = require('electron').dialog
var workDirectory;

ipc.on('open-file-dialog', function (event) {
  dialog.showOpenDialog({
    properties: ['openFile', 'openDirectory']
  }, function (files) {
	  workDirectory = files;
    if (files) event.sender.send('selected-directory', files)
  })
})
