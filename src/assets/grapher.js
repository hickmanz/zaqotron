import Chart from 'chart.js';

const $ = require('jquery');
const ipc = require('electron').ipcRenderer;
const remote = require('electron').remote; 
const path = require('path')
const fs = require('fs-extra')
const app = remote.app;
const Datastore = require('nedb');
const db = new Datastore({ filename: path.join(app.getPath('userData'), 'main.db'), autoload: true, timestampData: true  });

var graphData = []
var chartDataSets = []

document.onreadystatechange = function () {
  if (document.readyState == "complete") {
    const selectDirBtn = document.getElementById('select-directory');
    const choseFileBtn = document.getElementById('chose-file');

    ipc.send('grapher-ready');

    selectDirBtn.addEventListener('click', function (event) {
      ipc.send('open-file-dialog');
    });

    choseFileBtn.addEventListener('click', function (event) {
      ipc.send('file-select', selectedFile);
      const window = remote.getCurrentWindow();
      window.close();
    });

  }
}

ipc.on('data-ids', function (event, data) {
  graphData = []
  chartDataSets = []

  console.dir(data);
  data.forEach(function(d_id) {
    db.find({_id: d_id}).exec(function(err, docs) {  
      docs.forEach(function(d) {
          graphData.push(d)
      });
    });
  })
  graphData.forEach(function(docData){
    var tmpData = docData.data.shift()
    if(docData.type == "torsion"){
      tmpData = tmpData.map(function(x) { 
        return { 
          x: x[3], 
          y: x[4] 
        }; 
      });
    }else {
      tmpData = tmpData.map(function(x) { 
        return { 
          x: x[1], 
          y: x[2] 
        }; 
      });
    }
    chartDataSets.push(tmp)
  })
  console.dir(graphData)
  console.log(chartDataSets)

});

//graph data
//allow export

