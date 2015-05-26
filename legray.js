/* 
  usage: node legray

  dependency: weather.js

  Bachinger, J. and Reining, E. (2009), An empirical statistical model for predicting 
  the yield of herbage from legume-grass swards within organic crop rotations based on 
  cumulative water balances.
  Grass and Forage Science, 64: 144–159. doi: 10.1111/j.1365-2494.2009.00678.x 
*/

var fs = require('fs');

var legray = function (soilTexture, weather, cuttingDates) {

  /* constants */
  var PAWC_rz = (function (st) {

    switch(st) {
      case 'sand':
        return 80;
      case 'loamy sand':
        return 110;
      case 'sandy loam':
        return 140;
      case 'loam':
        return 195;
      case 'silty loam':
        return 235;
      case 'silt':
        return 325;
      case 'sandy clay':
        return 145;
      case 'silty clay':
        return 180;
      case 'clay':
        return 160;
      default:
        return 140;
    }

  }(soilTexture))
    , T_g = 5
  /* Table 4 & model B1 */
    , β_0 = 1.783
    , β_1 = 0.025
    , β_2 = -0.0552 // CN
    ;

  /* variables */
  var PAW_0 = PAWC_rz * 0.5
    , ETP = 0
    , ETA = []
    , PREC = 0
    , T = 0
    , R_g = 0
    , date = weather.date[0]
    , m = parseInt(date.substr(5, 2)) 
    , year = parseInt(date.substr(0, 4))
    , CN = 1
    , daysSinceCut = 0
    , Y = [] // store yields
    ;

  var Σ_ETA_cut = function (i, j) {

    return ETA.slice(i, j).reduce(function (a, b) {
      return a + b;
    });

  };

  /* eq. 2 */
  var fnETP = function (R_g, T) {

    return (93 + R_g) * (22 + T) / (150 * (123 + T));

  };

  /* eq. 3 */
  var fnPAW_1 = function (PAW_0, PREC, ETP) {

    var PAW_1 = PAW_0 + PREC - ETP;

    if (PAW_1 > PAWC_rz)
      PAW_1 = PAWC_rz;
    else if (PAW_1 < 0)
      PAW_1 = 0;

    return PAW_1;

  };


  /* eq. 4 'one-phase-approach' */
  var fnETA = function (PAW_0, PREC, ETP, T, m) {

    var ETA = ETP;

    if (ETP > PAW_0 + PREC)
      ETA = PAW_0 + PREC;
    
    if (T < T_g)
      ETA = 0;

    if (m === 11 || m === 12 || m === 1 || m === 2)
      ETA = 0;

    return ETA;

  };


  /* eq. 12 */
  var y_cut = function (i, j) {
    
    return β_0 + β_1 * Σ_ETA_cut(i, j) + β_2 * CN;
  
  }; 


  /* run model */
  for (var i = 0, is = weather.T.length; i < is; i++) {

    PREC = weather.PREC[i];
    T = weather.T[i];
    R_g = weather.R_g[i];
    date = weather.date[i];
    m = parseInt(date.substr(5, 2)); // extract month from ISO Date

    if (year < parseInt(date.substr(0, 4))) { // next year?
      year = parseInt(date.substr(0, 4));
      CN = 1;
    }

    ETP = fnETP(R_g, T);
    PAW_1 = fnPAW_1(PAW_0, PREC, ETP);

    ETA[i] = fnETA(PAW_0, PREC, ETP, T, m);

    if (cuttingDates.indexOf(weather.date[i]) >= 0) {

      Y.push({
        date: date,
        yield: y_cut(i - daysSinceCut, i),
        CN: CN
      });

      daysSinceCut = 0;
      CN++;
    
    }

    daysSinceCut++;

  }

  return Y;

};


// test
eval(fs.readFileSync('../weather.js/weather.js').toString());
function getWeather(lat, lon) {

  var rr = JSON.parse(fs.readFileSync('rr_' + lat + '_' + lon + '.json').toString());
  var tg = JSON.parse(fs.readFileSync('tg_' + lat + '_' + lon + '.json').toString());
  var tn = JSON.parse(fs.readFileSync('tn_' + lat + '_' + lon + '.json').toString());
  var tx = JSON.parse(fs.readFileSync('tx_' + lat + '_' + lon + '.json').toString());
 
  /* read weather files */
  var weatherData = {
    date: [],
    T: [],
    R_g: [],
    PREC: [],
    tmin: [],
    tmax: []
  };

  for (var d = 0; d < rr.values.length; d++) {
    weatherData.PREC.push(rr.values[d] < 0 ? 0 : rr.values[d] * rr.scale);
    weatherData.tmin.push(tn.values[d] * tn.scale);
    weatherData.tmax.push(tx.values[d] * tx.scale);
    if (weatherData.tmin[d] > weatherData.tmax[d]) {
      weatherData.tmax[d] = weatherData.tmin[d] * 1.1; // TODO: seems to happen in some ecad values
    }
    weatherData.T.push(tg.values[d] * tg.scale);
  }

  var solar = weather.solar(lat, weatherData.tmin, weatherData.tmax, '1995-01-01');
  for (var d = 0, ds = solar.PPF.length; d < ds; d++) {
    weatherData.R_g[d] = solar.R_s[d];
    weatherData.date[d] = solar.date[d];
  }

  return weatherData;
}

var weatherData = getWeather(52.625, 13.375);
var cuttingDates = [];

for (var d = 0, ds = weatherData.date.length; d < ds; d++) {
  if (weatherData.date[d].indexOf('-05-15') > -1)
    cuttingDates.push(weatherData.date[d]);
  else if (weatherData.date[d].indexOf('-07-01') > -1)
    cuttingDates.push(weatherData.date[d]);
  else if (weatherData.date[d].indexOf('-08-01') > -1)
    cuttingDates.push(weatherData.date[d]);
}

var Y = legray('sandy loam', weatherData, cuttingDates);

console.log(Y);

// csv
var csv = 'date;yield;CN\n';
for (var y = 0; y < Y.length; y++) {
  csv += Y[y].date + ';' + Y[y].yield + ';' + Y[y].CN + '\n';
}
fs.writeFileSync('out.csv', csv);

