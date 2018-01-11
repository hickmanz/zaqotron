// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
var $ = require('jquery');
const ipc = require('electron').ipcRenderer;
const path = require('path')
const remote = require('electron').remote; 
const nav = require('./assets/nav')
const settings = require('electron').remote.require('electron-settings');

var selectedDirectory;

const selectDirBtn = document.getElementById('select-directory');
const continueBtn = document.getElementsByClassName('continue-btn');

selectDirBtn.addEventListener('click', function (event) {
    ipc.send('open-file-dialog')
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
}; 

document.onreadystatechange = function () {
  if (document.readyState == "complete") {
    init(); 
  }
};

function continueClicked(page){
  switch (page) {
    case 'setup':
      settings.set('setup', {
        'isComplete': true
      });
      settings.set('settings', {
        'workDir': selectedDirectory
      });
      nav.switchToPage('get-started');
      return true;
    
    case 'get-started':
      nav.switchToPage('main');
      return true;

  }
}