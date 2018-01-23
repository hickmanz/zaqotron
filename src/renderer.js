import { deflate } from 'zlib';
import { isRegExp } from 'util';

import Chart from 'chart.js';
import { request } from 'https';
import { Series, DataFrame } from 'pandas-js';

// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
const $ = require('jquery');
const ipc = require('electron').ipcRenderer;
const path = require('path')
const fs = require('fs-extra')
var tmp = require('tmp');
const remote = require('electron').remote; 
const app = remote.app;
const csvParse = require('csv-parse')
const dateFormat = require('dateformat');
const nav = require('./assets/nav')
const settings = require('electron').remote.require('electron-settings');
const socket = require('socket.io-client')('http://localhost:5000/proc');

socket.on('connect', function(){
  console.log('connected to python')

});

const Datastore = require('nedb');
const db = new Datastore({ filename: path.join(app.getPath('userData'), 'main.db'), autoload: true, timestampData: true  });

const SerialPort = require('serialport');
const Readline = SerialPort.parsers.Readline;
const parser = new Readline();

var selectedDirectory;
var caliperPort;

var tmpDir;
var selectedFile

var isRunning = false;
var caliperOffset = 0;
var deflectionUnitsMM = true;
var lastCaliperRead;

var deflectionData ={
  df:[],
  type: ""
}

var chartData = {
  datasets:[
    {
      label: 'Deflection',
      borderColor: '#c14c4c',
      data:[]
    }
  ]
};

var testType;
var forceUnits;
var torqueArmLng;
var forceStartVal = 0.1;
var testName

var prevTime;

var deflectionChart
var ctx;
var options = {
  animation: false,
  responsive: true,
  maintainAspectRatio: false,
  elements: { point: { radius: 0 } },
  scales:{
    xAxes: [{
      type: 'linear',
      display: true,
      scaleLabel: {
        display: true,
        labelString: 'Time (s)',
        fontStyle: 'bold'
      },
      ticks: {
        callback: function(value, index, values) {
          return parseFloat(value).toFixed(2);
        },
          autoSkip: true,
          maxTicksLimit: 30,
          stepSize: .1
        }
      }],
      yAxes: [{
        type: 'linear',
        display: true,
        scaleLabel: {
          display: true,
          labelString: 'Deflection (mm)',
          fontStyle: 'bold'
        }
      }]
    }
  
};
console.log(app.getAppPath())
fs.ensureDir(app.getPath('userData') + '/tmp', err => {
  console.log(err) // => null
  tmpDir = app.getPath('userData') + '/tmp'

})

const continueBtn = document.getElementsByClassName('continue-btn');
const connectBtn = document.getElementById('connect-calipers');
const zeroBtn = document.getElementById('zero-calipers');
const portSelector = document.getElementById('portNumber');
const testTypeSelector = document.getElementById('testType');
const forceUnitSelector = document.getElementById('forceUnitsSelect');
const testStartBtn = document.getElementById('start-test');
const testStopBtn = document.getElementById('stop-test');
const selectDirBtn = document.getElementById('select-directory');
const choseFileBtn = document.getElementById('chose-file');
const graphBtn = document.getElementById('graph-data');
const deleteBtn = document.getElementById('delete-data');

graphBtn.addEventListener('click', function(event){
  //get seleteced IDs and send to graph
  var checked = $('#testList input:checked').map(function(){
    return $(this).val();
  }).get();

  if(checked.length == 0){
    alert('Nothing selected')
  } else {
    graphData(checked);
  }

})
deleteBtn.addEventListener('click', function(event){
  var checked = $('#testList input:checked').map(function(){
    return $(this).val();
  }).get();

  if(checked.length == 0){
    alert('Nothing selected')
  } else {
    db.remove({_id: { $in: checked}}, { multi: true }, function (err, numRemoved) {
      if(err){
        alert(err)
      }
      updateTestList()
    });
  }
})

selectDirBtn.addEventListener('click', function (event) {
  ipc.send('open-file-dialog');
});

choseFileBtn.addEventListener('click', function (event) {
  
  //parse csv created by python once it say it is done
  var parseForceCSV = csvParse({relax_column_count: true, from: 7, columns: [false, 'Force', false, 'Time', false]}, function(err, output){
    if(err){
      alert(err)
      return
    } else {
      var forceData = output;
      let forceDF;
      let deflectionDF;

      forceDF = new DataFrame(forceData)
      deflectionDF = new DataFrame(deflectionData.df)   

      var newForceName = tmp.tmpNameSync({dir: tmpDir});
      var newDeflectionName = tmp.tmpNameSync({dir: tmpDir});
      var combinedName = tmp.tmpNameSync({dir: tmpDir});
      console.log(newForceName)
      
      fs.writeFile(newForceName, forceDF.to_csv(), 'utf8', function (err) {
        if (err) {
          console.log('Some error occured - file either not saved or corrupted file saved.');
        } else{
          console.log('It\'s saved!');
        }
      });
      fs.writeFile(newDeflectionName, deflectionDF.to_csv(), 'utf8', function (err) {
        if (err) {
          console.log('Some error occured - file either not saved or corrupted file saved.');
        } else{
          console.log('It\'s saved!');
        }
      });
      
      var toSocket = {
        dir : tmpDir.split("\\").join("/"),
        deflectionFile: newDeflectionName.split("\\").join("/"),
        forceFile: newForceName.split("\\").join("/"),
        combinedFile: combinedName.split("\\").join("/"),
        type: testType,
        torqueArmLng: torqueArmLng,
        forceStartVal: forceStartVal,
        forceUnits: forceUnits,
        testName: testName
      }

      socket.emit('start-process', toSocket);
    }
  })
    
  
  console.log(selectedFile)
  fs.createReadStream(selectedFile[0]).pipe(parseForceCSV);
  testName = $("#testname").val()
  $("#test-name").innerHTML = ""
  nav.switchToPage('test-setup');


});

ipc.on('selected-directory', function (event, path) {
  document.getElementById('selected-file').innerHTML = `You selected: ${path}`;
  selectedFile = path;
  document.getElementById('chose-file').classList.remove('inactive');
})

$("#torque-arm-length").on("change paste keyup", function() {
  torqueArmLng = parseFloat($(this).val());
});
$("#force-start-value").on("change paste keyup", function() {
  forceStartVal = parseFloat($(this).val());
});

zeroBtn.addEventListener('click', function(event){
  caliperOffset = lastCaliperRead;
});

testStartBtn.addEventListener('click', function(event){
  isRunning = true;
  chartData.datasets[0].data =[];
  deflectionData.df = [];
  deflectionData.type = testType;
  deflectionData.forceUnits = forceUnits;
  if(testType == "Torsion"){
    deflectionData.torqueArmLng = torqueArmLng;
  }
  deflectionData.forceStartVal = forceStartVal;
  nav.switchToPage('running');
});

testStopBtn.addEventListener('click', function(event){
  isRunning = false;
  deflectionChart.destroy()
  nav.switchToPage('post-run');
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

socket.on('proc-finished', function (data) {
  fs.createReadStream(data.combinedPath).pipe(csvParse({relax_column_count: true}, function(err, output){
    if(err){
      alert(err)
      return
    } else {
      var combinedData = output
      fs.unlink(data.combinedPath)
      fs.unlink(data.forcePath)
      fs.unlink(data.deflectionPath)
      //savedata to db - open graph
      var now = new Date()

      var newDocument = {
        data : output,
        name : data.testName,
        type : testType,
        torqueArmLng: torqueArmLng,
        forceStartVal: forceStartVal,
        forceUnits: forceUnits,
        date: dateFormat(now, "m-d-yyyy, h:MM")
      }

      console.dir(newDocument)
      db.insert(newDocument, function(err, doc){
        console.log('Inserted', doc.name, 'with ID', doc._id);
        console.dir(doc)
        graphData([doc._id]);
        updateTestList()
      })
    }
  }));

});
function graphData(dataIds){
  ipc.send('graph-data', {dataIds: dataIds})
}
var parseCombinedCSV = csvParse({relax_column_count: true}, function(err, output){
  if(err){
    alert(err)
    return
  } else {
    var combinedData = output
    fs.unlink()
  }
})


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

  updateTestList()

  ctx = document.getElementById("myChart").getContext("2d");  
}; 

document.onreadystatechange = function () {
  if (document.readyState == "complete") {
    init(); 
    console.log('another one');
  }
};


function updateTestList(){
  var ul = document.getElementById("testList");
  ul.innerHTML = ''
  db.find({}).sort({createdAt: -1}).exec(function(err, docs) {  
    docs.forEach(function(d) {
      var li = document.createElement("li");
      var checkbox = document.createElement('input');
      checkbox.type = "checkbox";
      checkbox.className = "checkbox dataList"
      checkbox.value = d._id;
      var nameField = document.createElement('div');
      nameField.className="name"
      nameField.innerHTML = d.name
      var typeField = document.createElement('div');
      typeField.className="type"
      typeField.innerHTML =d.type
      var dateField = document.createElement('div');
      dateField.className="date"
      dateField.innerHTML =d.date
      li.appendChild(checkbox);
      li.appendChild(nameField)
      li.appendChild(typeField)
      li.appendChild(dateField)
      ul.appendChild(li);
    });
  });
}

function searchPorts(){
  for (i = 1; i < portSelector.options.length; i++) {
    portSelector.options[i] = null;    
  }

  SerialPort.list(function (err, ports) {
    ports.forEach(function(port) {
      var el = document.createElement("option");
      el.textContent = port.comName + ' - ' + port.manufacturer;
      el.value = port.comName;
      portSelector.appendChild(el);
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
  if(isRunning){
    if(deflectionData.df.length == 0){
      prevTime = new Date().getTime();

      deflectionData.df.push({'Deflection': deflection, 'Time': 0});
      chartData.datasets[0].data.push({x: 0, y: parseFloat(deflection)});
      deflectionChart = new Chart(ctx, {type:'line', data: chartData, options: options});

    } else {
      var timeChange = (new Date().getTime() - prevTime )/1000;
      prevTime = new Date().getTime();
      var newTime = deflectionData.df[deflectionData.df.length-1].Time + timeChange;

      deflectionData.df.push({'Deflection': deflection, 'Time': newTime});
      chartData.datasets[0].data.push({x: newTime, y: parseFloat(deflection)});
    }
    document.getElementById("currentDeflection-running").innerHTML = deflection;
    //var myLineChart = new Chart(ctx, {type:'line', data: chartData, options: options});
    deflectionChart.update()
  } else {
    document.getElementById("currentDeflection").innerHTML = deflection;
  }

}