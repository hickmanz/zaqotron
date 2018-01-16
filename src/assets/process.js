
const remote = require('electron').remote; 
import { Series, DataFrame } from 'pandas-js';

let forceDF;
let deflectionDF;

function createDataFrames(deflectionDataRaw, forceDataRaw) {
  //forceDF = new DataFrame(forceDataRaw)
  deflectionDF = new DataFrame(deflectionDataRaw.df)

  console.log(deflectionDF.toString())
}


module.exports = {
  processData: function(deflectionData, forceData) {
    createDataFrames(deflectionData, forceData);
    return;
  }
}