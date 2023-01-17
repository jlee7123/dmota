// Express 기본 모듈 불러오기
const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');

// sqliteDB 사용
var sqlite3 = require('sqlite3').verbose();

var schedule = require('node-schedule');


var request = require('request');

schedule.scheduleJob('*/1 * * * *', function () {

  var curDate = new Date();

  if ((curDate.getMinutes() % 15) == 5) { //15분 간격에서 5분을 더한 시간에 동작한다.

    console.log(curDate);

    strEndDate = new Date(curDate).toISOString().substr(0, 16)

    startDate = curDate.setMinutes(curDate.getMinutes() - 5);
    strStartDate = new Date(curDate).toISOString().substr(0, 16);

    ///// 첫번쨰 초분광 장비 insert 시작////////////////////////////

    // 초분광 센서에서 읽어오는 URL 주소 지정  -> https://아이디:비번@wispcloud.waterinsight.nl/api/query?SERVICE=Data&VERSION=1.0&REQUEST=GetData&장비번호 : 아이디,비번,장비번호 부여되면 그 부분만 변경
    const url1 = 'https://dongmoon:WISP4Korea@wispcloud.waterinsight.nl/api/query?SERVICE=Data&VERSION=1.0&REQUEST=GetData&instrument=WISPstation015&time=' + strStartDate + ',' + strEndDate + '&INCLUDE=measurement.date,waterquality.chla,waterquality.tsm,waterquality.kd,waterquality.cpc,ed.irradiance,ld.radiance,lu.radiance,level2.reflectance';

    console.log(url1);

    var getText1 = https.get(url1, function (res) {
      var data = '';
      res.on('data', function (chunk) {
        data += chunk;
      });
      res.on('end', function () {

        var array1 = data.split('\n');
        var array2 = array1[21].split('\t');

        strSaveDate = array2[0].toString().substr(0, 16).replace(' ', 'T');

        console.log("서버에서 요청한 데이터 시간 : " + strStartDate);
        console.log("센서에서 응답한 데이터 시간 : " + strSaveDate);

        if (strStartDate == strSaveDate) {          

          var jsonDataObj = {
            "m2m:cin": {
              "con": {
                "chla": 0,
                "tsm": 0,
                "kd": 0,
                "cpc": 0,
                "edIrradiance": [],
                "ldRadiance": [],
                "luRadiance": [],
                "reflectance": []
              }
            }
          };

          jsonDataObj['m2m:cin'].con.chla = Number(array2[1]);
          jsonDataObj['m2m:cin'].con.tsm = Number(array2[2]);
          jsonDataObj['m2m:cin'].con.kd = Number(array2[3]);
          jsonDataObj['m2m:cin'].con.cpc = Number(array2[4]);

          jsonDataObj['m2m:cin'].con.edIrradiance = JSON.parse(array2[5])
          jsonDataObj['m2m:cin'].con.ldRadiance = JSON.parse(array2[6]);
          jsonDataObj['m2m:cin'].con.luRadiance = JSON.parse(array2[7]);
          jsonDataObj['m2m:cin'].con.reflectance = JSON.parse(array2[8]);

          request.post({
            headers: {
              'Content-Type': 'application/json; ty=4',
              'Accept': 'application/json',
              'X-M2M-RI': '12345',
              'X-M2M-Origin': 'SM'
            },

            url: 'http://203.253.128.139:7599/wdc_base/sensor_1/hyperSpectrum',//센서의 데이터를 Insert 할 URL 주소 지정'
            body: jsonDataObj,
            json: true
          }, function (error, response, body) {});
          console.log("WISPstation015 " + strStartDate + " 데이터를 Insert 하였습니다.");
          console.log('WISPstation015:', jsonDataObj);
        }
        else{
          console.log("요청한 시간데이터가 없습니다.");
        }
      });
    });
   ///// 첫번쨰 초분광 장비 insert 끝////////////////////////////

   

   ///// 두번쨰 초분광 장비 insert 시작////////////////////////////

    // 초분광 센서에서 읽어오는 URL 주소 지정  -> https://아이디:비번@wispcloud.waterinsight.nl/api/query?SERVICE=Data&VERSION=1.0&REQUEST=GetData&장비번호 : 아이디,비번,장비번호 부여되면 그 부분만 변경       
    const url2 = 'https://dongmoon:WISP4Korea@wispcloud.waterinsight.nl/api/query?SERVICE=Data&VERSION=1.0&REQUEST=GetData&instrument=WISPstation016&time=' + strStartDate + ',' + strEndDate + '&INCLUDE=measurement.date,waterquality.chla,waterquality.tsm,waterquality.kd,waterquality.cpc,ed.irradiance,ld.radiance,lu.radiance,level2.reflectance';

    console.log(url2);

    var getText1 = https.get(url2, function (res) {
      var data = '';
      res.on('data', function (chunk) {
        data += chunk;
      });
      res.on('end', function () {

        var array1 = data.split('\n');
        var array2 = array1[21].split('\t');

        strSaveDate = array2[0].toString().substr(0, 16).replace(' ', 'T');

        console.log("서버에서 요청한 데이터 시간 : " + strStartDate);
        console.log("센서에서 응답한 데이터 시간 : " + strSaveDate);

        if (strStartDate == strSaveDate) {
          var jsonDataObj = {
            "m2m:cin": {
              "con": {
                "chla": 0,
                "tsm": 0,
                "kd": 0,
                "cpc": 0,
                "edIrradiance": [],
                "ldRadiance": [],
                "luRadiance": [],
                "reflectance": []
              }
            }
          };

          jsonDataObj['m2m:cin'].con.chla = Number(array2[1]);
          jsonDataObj['m2m:cin'].con.tsm = Number(array2[2]);
          jsonDataObj['m2m:cin'].con.kd = Number(array2[3]);
          jsonDataObj['m2m:cin'].con.cpc = Number(array2[4]);

          jsonDataObj['m2m:cin'].con.edIrradiance = JSON.parse(array2[5])
          jsonDataObj['m2m:cin'].con.ldRadiance = JSON.parse(array2[6]);
          jsonDataObj['m2m:cin'].con.luRadiance = JSON.parse(array2[7]);
          jsonDataObj['m2m:cin'].con.reflectance = JSON.parse(array2[8]);

          request.post({
            headers: {
              'Content-Type': 'application/json; ty=4',
              'Accept': 'application/json',
              'X-M2M-RI': '12345',
              'X-M2M-Origin': 'SM'
            },
            
            url: 'http://203.253.128.139:7599/wdc_base/sensor_3/hyperSpectrum',//센서의 데이터를 Insert 할 서버 URL 주소 지정
            body: jsonDataObj,
            json: true
          }, function (error, response, body) {});
          console.log("WISPstation016 " + strStartDate + " 데이터를 Insert 하였습니다.");
          console.log('WISPstation016:', jsonDataObj);
        }
        else{
          console.log("요청한 시간데이터가 없습니다.");
        }
      });
    });
    ///// 두번쨰 초분광 장비 insert 끝////////////////////////////

  }

});


// 익스프레스 객체 생성
var app = express();

// 기본 포트를 app 객체에 속성으로 설정
app.set('port', process.env.PORT || 3000);

// Express 서버 시작
http.createServer(app).listen(app.get('port'), function () {
  console.log('익스프레스 서버를 시작했습니다 : ' + app.get('port'));
});