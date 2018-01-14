import { deflate } from 'zlib';

// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
var $ = require('jquery');
const ipc = require('electron').ipcRenderer;
const path = require('path')
const remote = require('electron').remote; 
const nav = require('./assets/nav')
const settings = require('electron').remote.require('electron-settings');
const SerialPort = require('serialport');
const Readline = SerialPort.parsers.Readline;
const parser = new Readline();

var selectedDirectory;
var caliperPort;

var isRunning = false;
var caliperOffset = 0;
var deflectionUnitsMM = true;
var lastCaliperRead;

var testType;
var forceUnits;

const selectDirBtn = document.getElementById('select-directory');
const continueBtn = document.getElementsByClassName('continue-btn');
const connectBtn = document.getElementById('connect-calipers');
const zeroBtn = document.getElementById('zero-calipers');
const portSelector = document.getElementById('portNumber');
const testTypeSelector = document.getElementById('testType');
const forceUnitSelector = document.getElementById('forceUnitsSelect');

selectDirBtn.addEventListener('click', function (event) {
  ipc.send('open-file-dialog')
});

zeroBtn.addEventListener('click', function(event){
  caliperOffset = lastCaliperRead;
  
});

forceUnitSelector.addEventListener('change', function(event){
  forceUnits = forceUnitSelector.options[forceUnitSelector.selectedIndex].value;
  document.getElementById("force-units").innerHTML = forceUnits;

});

testTypeSelector.addEventListener('change', function(event){
  testType = testTypeSelector.options[testTypeSelector.selectedIndex].value;
  
  if(testType == "torsion"){
    document.getElementById('torque-arm-section').style.visibility = "visible";

  } else {
    document.getElementById('torque-arm-section').style.visibility = "hidden";

    //hide torque arm item
  }

});

portSelector.addEventListener('click',function(ev){
  if(ev.offsetY < 0){
    
  }else{
    searchPorts();
  }
});

connectBtn.addEventListener('click', function (event) {
  document.getElementById("connection-error").innerHTML = '';
  var e = portSelector;
  caliperPort = e.options[e.selectedIndex].value;
  console.log(caliperPort);
  var port = new SerialPort(caliperPort, {baudRate: 9800}, function (err) {
    if (err) {
      document.getElementById("connection-error").innerHTML = 'Error: ' + err.message;
      return console.log('Error: ', err.message);

    }  else {
      nav.switchToPage('test-setup');
      port.pipe(parser);
      parser.on('data', processCalipers);

    }
  });
});

for (var i = 0; i < continueBtn.length; i++) {
  continueBtn[i].addEventListener('click', function (event) {
    if(!$(this).hasClass('inactive')){
      continueClicked(nav.getCurrentPage());
    }
  });
}

ipc.on('selected-directory', function (event, path) {
  document.getElementById('selected-directory').innerHTML = `You selected: ${path}`;
  selectedDirectory = path;
  if(nav.getCurrentPage() == "setup"){
    document.getElementById('setup-continue').classList.remove('inactive');
  }
  
});
//Initialize windows 
function init() { 
  document.getElementById("min-btn").addEventListener("click", function (e) {
    const window = remote.getCurrentWindow();
    window.minimize(); 
  });
  
  document.getElementById("max-btn").addEventListener("click", function (e) {
    const window = remote.getCurrentWindow();
    if (!window.isMaximized()) {
      window.maximize();
    } else {
      window.unmaximize();
    }	 
  });
  
  document.getElementById("close-btn").addEventListener("click", function (e) {
    const window = remote.getCurrentWindow();
    window.close();
  }); 
  searchPorts();

  
}; 

document.onreadystatechange = function () {
  if (document.readyState == "complete") {
    init(); 
  }
};

function searchPorts(){
  for (i = 1; i < portSelector.options.length; i++) {
    portSelector.options[i] = null;    
  }

  SerialPort.list(function (err, ports) {
    console.log(ports);
    ports.forEach(function(port) {
      var el = document.createElement("option");
      el.textContent = port.comName + ' - ' + port.manufacturer;
      el.value = port.comName;
      portSelector.appendChild(el);
      console.log(port.comName);
      console.log(port.pnpId);
      console.log(port.manufacturer);
    });
  });
}

function continueClicked(page){
  switch (page) {
    case 'setup':
      settings.set('setup', {
        'isComplete': true
      });
      nav.switchToPage('connect');
      return true;
    
    case 'connect':
      nav.switchToPage('test-setup');
      return true;

  }
}

var processCalipers = function(data){
  data = parseFloat(data).toFixed(2)
  lastCaliperRead = data;
  var deflection;

  if(deflectionUnitsMM){
    deflection = (data - caliperOffset).toFixed(2);
  } else {
    deflection = (data - caliperOffset) * 0.0393701;
  }
  if(testType == 'torsion' || testType == 'compression'){
    deflection = deflection * -1;
  }
  
  document.getElementById("currentDeflection").innerHTML = deflection;
  if(isRunning){
    //STORE OR WHATEVER
  } 
}