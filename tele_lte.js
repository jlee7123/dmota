/**
 * Created by Wonseok Jung in KETI on 2020-08-02.
 */

const mqtt = require("mqtt")
const express = require('express');
const {nanoid} = require("nanoid")
const fs = require("fs")
const url = require("url");
const shortid = require("shortid");
const http = require("http");
const util = require("util");
require("moment-timezone");
const moment = require('moment')
moment.tz.setDefault("Asia/Seoul");
const {spawn, exec} = require("child_process");

let sh_adn = require('./http_adn')

global.conf = JSON.parse(process.env.conf)

let HTTP_SUBSCRIPTION_ENABLE = 0
let MQTT_SUBSCRIPTION_ENABLE = 0

let app = express()

let sh_state = 'rtvct'

const retry_interval = 2500;
const normal_interval = 100;

let local_mqtt_client = null

let pub_gcs_topic = '/TELE/gcs/lte'
let sub_drone_topic = '/TELE/drone'
let sub_sortie_topic = '/TELE/sorite'

let mqtt_client = null
var noti_topic = '';
var muv_sub_gcs_topic = '';

var muv_sub_msw_topic = [];

let prev_sortie_name = 'disarm'
let my_sortie_name = 'disarm'
let my_gcs_name = '';
let my_parent_cnt_name = '';
let my_cnt_name = '';
let my_mission_parent = ''
let my_mission_name = ''
let my_gimbal_parent = ''
let my_gimbal_name = ''
let my_command_parent_name = ''
let my_command_name = ''

let my_drone_type = 'ardupilot';
let my_secure = 'off';
let my_system_id = 8;

let gimbal = {}

local_mqtt_connect('localhost')

function local_mqtt_connect(serverip) {
    if (local_mqtt_client === null) {
        if (conf.usesecure === 'disable') {
            var connectOptions = {
                host: serverip,
                port: conf.cse.mqttport,
                protocol: "mqtt",
                keepalive: 10,
                clientId: 'TELE_LTE_' + nanoid(15),
                protocolId: "MQTT",
                protocolVersion: 4,
                clean: true,
                reconnectPeriod: 2000,
                connectTimeout: 2000,
                rejectUnauthorized: false
            }
        } else {
            connectOptions = {
                host: serverip,
                port: conf.cse.mqttport,
                protocol: "mqtts",
                keepalive: 10,
                clientId: 'TELE_LTE_' + nanoid(15),
                protocolId: "MQTT",
                protocolVersion: 4,
                clean: true,
                reconnectPeriod: 2000,
                connectTimeout: 2000,
                key: fs.readFileSync("./server-key.pem"),
                cert: fs.readFileSync("./server-crt.pem"),
                rejectUnauthorized: false
            }
        }

        local_mqtt_client = mqtt.connect(connectOptions)

        local_mqtt_client.on('connect', function () {
            console.log('local_mqtt is connected')

            if (sub_drone_topic !== '') {
                local_mqtt_client.subscribe(sub_drone_topic, function () {
                    console.log('[local_mqtt] sub_drone_topic is subscribed: ' + sub_drone_topic)
                })
            }
            if (sub_sortie_topic !== '') {
                local_mqtt_client.subscribe(sub_sortie_topic, function () {
                    console.log('[local_mqtt] sub_sortie_topic is subscribed: ' + sub_sortie_topic)
                })
            }
        })

        local_mqtt_client.on('message', function (topic, message) {
            if (topic === sub_sortie_topic) {
                my_sortie_name = message.toString()
                if (my_sortie_name !== prev_sortie_name) {
                    prev_sortie_name = my_sortie_name
                    my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name
                    sh_adn.crtct(my_parent_cnt_name + '?rcn=0', my_sortie_name, 0, function (rsc, res_body, count) {
                    })
                }
            } else if (topic === sub_drone_topic) {
                if (mqtt_client !== null) {
                    if (my_cnt_name !== '') {
                        // console.log(message.toString())
                        mqtt_client.publish(my_cnt_name, Buffer.from(message.toString(), 'hex'))
                        send_aggr_to_Mobius(my_cnt_name, message.toString(), 2000)
                    }
                }
            }
        })

        local_mqtt_client.on('error', function (err) {
            console.log('[local_mqtt] (error) ' + err.message)
        })
    }
}

var return_count = 0;
var request_count = 0;

function ready_for_notification() {
    if (HTTP_SUBSCRIPTION_ENABLE === 1) {
        server = http.createServer(app);
        server.listen(conf.ae.port, function () {
            console.log('http_server running at ' + conf.ae.port + ' port');
        });
    }

    if (MQTT_SUBSCRIPTION_ENABLE === 1) {
        for (var i = 0; i < conf.sub.length; i++) {
            if (conf.sub[i].name != null) {
                if (url.parse(conf.sub[i].nu).protocol === 'mqtt:') {
                    if (url.parse(conf.sub[i]['nu']).hostname === 'autoset') {
                        conf.sub[i]['nu'] = 'mqtt://' + conf.cse.host + '/' + conf.ae.id;
                        noti_topic = util.format('/oneM2M/req/+/%s/#', conf.ae.id);
                    } else if (url.parse(conf.sub[i]['nu']).hostname === conf.cse.host) {
                        noti_topic = util.format('/oneM2M/req/+/%s/#', conf.ae.id);
                    } else {
                        noti_topic = util.format('%s', url.parse(conf.sub[i].nu).pathname);
                    }
                }
            }
        }
        mqtt_connect(conf.cse.host);
        setInterval(() => {
            if (mqtt_client === null) {
                mqtt_connect(conf.cse.host);
            }
        }, 2000)

        // muv_mqtt_connect('localhost', 1883, muv_sub_msw_topic, muv_sub_gcs_topic);
    }
}


//// 깃 시작
function git_clone(mission_name, directory_name, repository_url) {
    console.log('[Git] Mission(' + mission_name + ') cloning...')
    try {
        require('fs-extra').removeSync('./' + directory_name);
    } catch (e) {
        console.log(e.message);
    }

    var gitClone = spawn('git', ['clone', repository_url, directory_name]);

    gitClone.stdout.on('data', function (data) {
        console.log('stdout: ' + data);
    });

    gitClone.stderr.on('data', function (data) {
        console.log('stderr: ' + data);
        if (data.includes('Could not resolve host')) {
            setTimeout(npm_install, 5000, mission_name, directory_name);
        }
    });

    gitClone.on('exit', function (code) {
        console.log('exit: ' + code);

        setTimeout(npm_install, 5000, mission_name, directory_name);
    });

    gitClone.on('error', function (code) {
        console.log('error: ' + code);
    });
}

function git_pull(mission_name, directory_name) {
    console.log('[Git] Mission(' + mission_name + ') pull...')
    try {
        if (process.platform === 'win32') {
            var cmd = 'git'
        } else {
            cmd = 'git'
        }

        var gitPull = spawn(cmd, ['pull'], {cwd: process.cwd() + '/' + directory_name});

        gitPull.stdout.on('data', function (data) {
            console.log('stdout: ' + data);
        });

        gitPull.stderr.on('data', function (data) {
            console.log('stderr: ' + data);
            if (data.includes('Could not resolve host')) {
                setTimeout(npm_install, 1000, mission_name, directory_name);
            }
        });

        gitPull.on('exit', function (code) {
            console.log('exit: ' + code);

            setTimeout(npm_install, 1000, mission_name, directory_name);
        });

        gitPull.on('error', function (code) {
            console.log('error: ' + code);
        });
    } catch (e) {
        console.log(e.message);
    }
}

function npm_install(mission_name, directory_name) {
    try {
        if (process.platform === 'win32') {
            var cmd = 'npm.cmd'
        } else {
            cmd = 'npm'
        }

        var npmInstall = spawn(cmd, ['install'], {cwd: process.cwd() + '/' + directory_name});

        npmInstall.stdout.on('data', function (data) {
            console.log('stdout: ' + data);
        });

        npmInstall.stderr.on('data', function (data) {
            console.log('stderr: ' + data);
        });

        npmInstall.on('exit', function (code) {
            console.log('exit: ' + code);

            setTimeout(fork_msw, 10, mission_name, directory_name)
        });

        npmInstall.on('error', function (code) {
            console.log('error: ' + code);

            setTimeout(npm_install, 1000, mission_name, directory_name);
        });
    } catch (e) {
        console.log(e.message);
    }
}

function fork_msw(mission_name, directory_name) {
    var executable_name = directory_name.replace(mission_name + '_', '');

    var nodeMsw = exec('sh ' + executable_name + '.sh', {cwd: process.cwd() + '/' + directory_name});

    nodeMsw.stdout.on('data', function (data) {
        console.log('stdout: ' + data);
    });

    nodeMsw.stderr.on('data', function (data) {
        console.log('stderr: ' + data);
    });

    nodeMsw.on('exit', function (code) {
        console.log('exit: ' + code);
    });

    nodeMsw.on('error', function (code) {
        console.log('error: ' + code);

        setTimeout(npm_install, 10, directory_name);
    });
}

function ae_response_action(status, res_body, callback) {
    var aeid = res_body['m2m:ae']['aei'];
    conf.ae.id = aeid;
    callback(status, aeid);
}

function create_cnt_all(count, callback) {
    if (conf.cnt.length == 0) {
        callback(2001, count);
    } else {
        if (conf.cnt.hasOwnProperty(count)) {
            var parent = conf.cnt[count].parent;
            var rn = conf.cnt[count].name;
            sh_adn.crtct(parent, rn, count, function (rsc, res_body, count) {
                if (rsc == 5106 || rsc == 2001 || rsc == 4105) {
                    create_cnt_all(++count, function (status, count) {
                        callback(status, count);
                    });
                } else {
                    callback(9999, count);
                }
            });
        } else {
            callback(2001, count);
        }
    }
}

function delete_sub_all(count, callback) {
    if (conf.sub.length == 0) {
        callback(2001, count);
    } else {
        if (conf.sub.hasOwnProperty(count)) {
            var target = conf.sub[count].parent + '/' + conf.sub[count].name;
            sh_adn.delsub(target, count, function (rsc, res_body, count) {
                if (rsc == 5106 || rsc == 2002 || rsc == 2000 || rsc == 4105 || rsc == 4004) {
                    delete_sub_all(++count, function (status, count) {
                        callback(status, count);
                    });
                } else {
                    callback(9999, count);
                }
            });
        } else {
            callback(2001, count);
        }
    }
}

function create_sub_all(count, callback) {
    if (conf.sub.length == 0) {
        callback(2001, count);
    } else {
        if (conf.sub.hasOwnProperty(count)) {
            var parent = conf.sub[count].parent;
            var rn = conf.sub[count].name;
            var nu = conf.sub[count].nu;
            sh_adn.crtsub(parent, rn, nu, count, function (rsc, res_body, count) {
                if (rsc == 5106 || rsc == 2001 || rsc == 4105) {
                    create_sub_all(++count, function (status, count) {
                        callback(status, count);
                    });
                } else {
                    callback('9999', count);
                }
            });
        } else {
            callback(2001, count);
        }
    }
}

global.drone_info = {};
global.mission_parent = [];

function retrieve_my_cnt_name(callback) {
    sh_adn.rtvct('/Mobius/' + conf.ae.approval_gcs + '/approval/' + conf.ae.name + '/la', 0, function (rsc, res_body, count) {
        if (rsc == 2000) {
            drone_info = res_body[Object.keys(res_body)[0]].con;
            //console.log(drone_info);

            if (drone_info.hasOwnProperty('update')) {
                drone_info.update = drone_info.update.toLocaleLowerCase()
                if (drone_info.update === 'enable' || drone_info.update === 'tele') {
                    const shell = require('shelljs')

                    if (shell.exec('git reset --hard HEAD && git pull').code !== 0) {
                        shell.echo('Error: command failed')
                        shell.exit(1)
                    } else {
                        console.log('Finish update !');
                        drone_info.update = 'disable';
                        sh_adn.crtci('/Mobius/' + conf.ae.approval_gcs + '/approval/' + conf.ae.name, 0, JSON.stringify(drone_info), null, function (){
                            if (drone_info.update === 'disable'){
                                shell.exec('pm2 restart TELE')
                            }
                        });
                    }
                }
            }

            conf.sub = [];
            conf.cnt = [];
            conf.fc = [];

            if (drone_info.hasOwnProperty('gcs')) {
                my_gcs_name = drone_info.gcs;
            } else {
                my_gcs_name = 'KETI_MUV';
            }

            if (drone_info.hasOwnProperty('host')) {
                conf.cse.host = drone_info.host;
            } else {
            }

            console.log("gcs host is " + conf.cse.host);

            var info = {};
            info.parent = '/Mobius/' + drone_info.gcs;
            info.name = 'Drone_Data';
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            info = {};
            info.parent = '/Mobius/' + drone_info.gcs + '/Drone_Data';
            info.name = drone_info.drone;
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            info.parent = '/Mobius/' + drone_info.gcs + '/Drone_Data/' + drone_info.drone;
            info.name = my_sortie_name;
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            my_parent_cnt_name = info.parent;
            my_cnt_name = my_parent_cnt_name + '/' + info.name;

            info = {};
            info.parent = '/Mobius/' + drone_info.gcs + '/Mission_Data/' + drone_info.drone;
            info.name = 'msw_lte';
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            info = {};
            info.parent = '/Mobius/' + drone_info.gcs + '/Mission_Data/' + drone_info.drone + '/msw_lte';
            info.name = 'LTE';
            conf.cnt.push(JSON.parse(JSON.stringify(info)));


// 현재 해당 파일 가지고 있을 시 - pull 실행, 해당 파일이 없을 시 - clone 실행 하는 부분

            try {  // run default mission of lte
                if (fs.existsSync('./msw_lte_msw_lte')) {
                    setTimeout(git_pull, 10, 'msw_lte', 'msw_lte_msw_lte');
                } else {
                    setTimeout(git_clone, 10, 'msw_lte', 'msw_lte_msw_lte', 'https://github.com/IoTKETI/msw_lte.git');
                }
            } catch (e) {
                console.log(e.message);
            }

            
            // set container for mission
            info = {};
            info.parent = '/Mobius/' + drone_info.gcs;
            info.name = 'Mission_Data';
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            info = {};
            info.parent = '/Mobius/' + drone_info.gcs + '/Mission_Data';
            info.name = drone_info.drone;
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            if (drone_info.hasOwnProperty('mission')) {
                for (var mission_name in drone_info.mission) {
                    if (drone_info.mission.hasOwnProperty(mission_name)) {
                        info = {};
                        info.parent = '/Mobius/' + drone_info.gcs + '/Mission_Data/' + drone_info.drone;
                        info.name = mission_name;
                        conf.cnt.push(JSON.parse(JSON.stringify(info)));

                        var chk_cnt = 'container';
                        if (drone_info.mission[mission_name].hasOwnProperty(chk_cnt)) {
                            for (var idx in drone_info.mission[mission_name][chk_cnt]) {
                                if (drone_info.mission[mission_name][chk_cnt].hasOwnProperty(idx)) {
                                    var container_name = drone_info.mission[mission_name][chk_cnt][idx].split(':')[0];
                                    info = {};
                                    info.parent = '/Mobius/' + drone_info.gcs + '/Mission_Data/' + drone_info.drone + '/' + mission_name;
                                    info.name = container_name;
                                    conf.cnt.push(JSON.parse(JSON.stringify(info)));

                                    // muv_sub_msw_topic.push(info.parent + '/' + info.name);

                                    info = {};
                                    info.parent = '/Mobius/' + drone_info.gcs + '/Mission_Data/' + drone_info.drone + '/' + mission_name + '/' + container_name;
                                    info.name = my_sortie_name;
                                    conf.cnt.push(JSON.parse(JSON.stringify(info)));
                                    mission_parent.push(info.parent);

                                    muv_sub_msw_topic.push(info.parent + '/#');

                                    if (drone_info.mission[mission_name][chk_cnt][idx].split(':').length > 1) {
                                        info = {};
                                        info.parent = '/Mobius/' + drone_info.gcs + '/Mission_Data/' + drone_info.drone + '/' + mission_name + '/' + container_name;
                                        info.name = 'sub_msw';
                                        info.nu = 'mqtt://' + conf.cse.host + '/' + drone_info.mission[mission_name][chk_cnt][idx].split(':')[1] + '?ct=json';
                                        conf.sub.push(JSON.parse(JSON.stringify(info)));
                                    }
                                }
                            }
                        }

                        chk_cnt = 'sub_container';
                        if (drone_info.mission[mission_name].hasOwnProperty(chk_cnt)) {
                            for (idx in drone_info.mission[mission_name][chk_cnt]) {
                                if (drone_info.mission[mission_name][chk_cnt].hasOwnProperty(idx)) {
                                    container_name = drone_info.mission[mission_name][chk_cnt][idx];
                                    info = {};
                                    info.parent = '/Mobius/' + drone_info.gcs + '/Mission_Data/' + drone_info.drone + '/' + mission_name;
                                    info.name = container_name;
                                    conf.cnt.push(JSON.parse(JSON.stringify(info)));

                                    info = {};
                                    info.parent = '/Mobius/' + drone_info.gcs + '/Mission_Data/' + drone_info.drone + '/' + mission_name + '/' + container_name;
                                    info.name = 'sub_msw';
                                    info.nu = 'mqtt://' + conf.cse.host + '/' + conf.ae.id + '?ct=json';
                                    conf.sub.push(JSON.parse(JSON.stringify(info)));
                                }
                            }
                        }

                        chk_cnt = 'fc_container';
                        if (drone_info.mission[mission_name].hasOwnProperty(chk_cnt)) {
                            for (idx in drone_info.mission[mission_name][chk_cnt]) {
                                if (drone_info.mission[mission_name][chk_cnt].hasOwnProperty(idx)) {
                                    container_name = drone_info.mission[mission_name][chk_cnt][idx];
                                    info = {};
                                    info.parent = '/Mobius/' + drone_info.gcs + '/Mission_Data/' + drone_info.drone + '/' + mission_name;
                                    info.name = container_name;
                                    conf.fc.push(JSON.parse(JSON.stringify(info)));
                                }
                            }
                        }

                        chk_cnt = 'git';
                        if (drone_info.mission[mission_name].hasOwnProperty(chk_cnt)) {
                            var repo_arr = drone_info.mission[mission_name][chk_cnt].split('/');
                            var directory_name = mission_name + '_' + repo_arr[repo_arr.length - 1].replace('.git', '');

                            try {
                                if (fs.existsSync('./' + directory_name)) {
                                    setTimeout(git_pull, 10, mission_name, directory_name);
                                } else {
                                    setTimeout(git_clone, 10, mission_name, directory_name, drone_info.mission[mission_name][chk_cnt]);
                                }
                            } catch (e) {
                                console.log(e.message);
                            }
                        }
                    }
                }
            }

            if (drone_info.hasOwnProperty('mav_ver')) {
                mav_ver = drone_info.mav_ver;
            } else {
                mav_ver = 'v1';
            }

            if (drone_info.hasOwnProperty('type')) {
                my_drone_type = drone_info.type;
            } else {
                my_drone_type = 'ardupilot';
            }

            var drone_type = {};
            drone_type.type = my_drone_type;

            if (drone_info.hasOwnProperty('secure')) {
                my_secure = drone_info.secure;
            } else {
                my_secure = 'off';
            }

            if (drone_info.hasOwnProperty('system_id')) {
                my_system_id = drone_info.system_id;
            } else {
                my_system_id = 8;
            }

            if (drone_info.hasOwnProperty('gimbal')) {
                gimbal.type = drone_info.gimbal.type;
                gimbal.portnum = drone_info.gimbal.portnum;
                gimbal.baudrate = drone_info.gimbal.baudrate;
            }

            // set container for gimbal
            var info = {};
            info.parent = '/Mobius/' + drone_info.gcs;
            info.name = 'Gimbal_Data';
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            info = {};
            info.parent = '/Mobius/' + drone_info.gcs + '/Gimbal_Data';
            info.name = drone_info.drone;
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            info.parent = '/Mobius/' + drone_info.gcs + '/Gimbal_Data/' + drone_info.drone;
            info.name = my_sortie_name;
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            my_gimbal_parent = info.parent;
            my_gimbal_name = my_gimbal_parent + '/' + info.name;

            // set container for GCS
            var info = {};
            info.parent = '/Mobius/' + drone_info.gcs;
            info.name = 'GCS_Data';
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            info = {};
            info.parent = '/Mobius/' + drone_info.gcs + '/GCS_Data';
            info.name = drone_info.drone;
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            my_command_parent_name = info.parent;
            my_command_name = my_command_parent_name + '/' + info.name;

            MQTT_SUBSCRIPTION_ENABLE = 1;
            sh_state = 'crtct';
            setTimeout(http_watchdog, normal_interval);

            drone_info.id = conf.ae.name;
            // console.log(drone_info);
            fs.writeFileSync('drone_info.json', JSON.stringify(drone_info, null, 4), 'utf8');

            callback();
        } else {
            console.log('x-m2m-rsc : ' + rsc + ' <----' + res_body);
            setTimeout(http_watchdog, retry_interval);
            callback();
        }
    });
}

function http_watchdog() {
    if (sh_state === 'rtvct') {
        retrieve_my_cnt_name(function () {

        });
    } else if (sh_state === 'crtae') {
        console.log('[sh_state] : ' + sh_state);
        sh_adn.crtae(conf.ae.parent, conf.ae.name, conf.ae.appid, function (status, res_body) {
            console.log(res_body);
            if (status == 2001) {
                ae_response_action(status, res_body, function (status, aeid) {
                    console.log('x-m2m-rsc : ' + status + ' - ' + aeid + ' <----');
                    sh_state = 'rtvae';
                    request_count = 0;
                    return_count = 0;

                    setTimeout(http_watchdog, normal_interval);
                });
            } else if (status == 5106 || status == 4105) {
                console.log('x-m2m-rsc : ' + status + ' <----');
                sh_state = 'rtvae';

                setTimeout(http_watchdog, normal_interval);
            } else {
                console.log('x-m2m-rsc : ' + status + ' <----');
                setTimeout(http_watchdog, retry_interval);
            }
        });
    } else if (sh_state === 'rtvae') {
        if (conf.ae.id === 'S') {
            conf.ae.id = 'S' + shortid.generate();
        }

        console.log('[sh_state] : ' + sh_state);
        sh_adn.rtvae(conf.ae.parent + '/' + conf.ae.name, function (status, res_body) {
            if (status == 2000) {
                var aeid = res_body['m2m:ae']['aei'];
                console.log('x-m2m-rsc : ' + status + ' - ' + aeid + ' <----');

                if (conf.ae.id != aeid && conf.ae.id != ('/' + aeid)) {
                    console.log('AE-ID created is ' + aeid + ' not equal to device AE-ID is ' + conf.ae.id);
                } else {
                    sh_state = 'crtct';
                    request_count = 0;
                    return_count = 0;

                    setTimeout(http_watchdog, normal_interval);
                }
            } else {
                console.log('x-m2m-rsc : ' + status + ' <----');
                setTimeout(http_watchdog, retry_interval);
            }
        });
    } else if (sh_state === 'crtct') {
        console.log('[sh_state] : ' + sh_state);
        create_cnt_all(request_count, function (status, count) {
            if (status == 9999) {
                setTimeout(http_watchdog, retry_interval);
            } else {
                request_count = ++count;
                return_count = 0;
                if (conf.cnt.length <= count) {
                    sh_state = 'delsub';
                    request_count = 0;
                    return_count = 0;

                    setTimeout(http_watchdog, normal_interval);
                }
            }
        });
    } else if (sh_state === 'delsub') {
        console.log('[sh_state] : ' + sh_state);
        delete_sub_all(request_count, function (status, count) {
            if (status == 9999) {
                setTimeout(http_watchdog, retry_interval);
            } else {
                request_count = ++count;
                return_count = 0;
                if (conf.sub.length <= count) {
                    sh_state = 'crtsub';
                    request_count = 0;
                    return_count = 0;

                    setTimeout(http_watchdog, normal_interval);
                }
            }
        });
    } else if (sh_state === 'crtsub') {
        console.log('[sh_state] : ' + sh_state);
        create_sub_all(request_count, function (status, count) {
            if (status == 9999) {
                setTimeout(http_watchdog, retry_interval);
            } else {
                request_count = ++count;
                return_count = 0;
                if (conf.sub.length <= count) {
                    sh_state = 'crtci';

                    ready_for_notification();

                    if (gimbal.hasOwnProperty('type')) {
                        setTimeout(() => {
                            require('./thyme_tas_gimbal')
                        }, 500);
                    }

                    setTimeout(http_watchdog, normal_interval);
                }
            }
        });
    } else if (sh_state === 'crtci') {
        console.log('[sh_state] : ' + sh_state);
    }
}

setTimeout(http_watchdog, normal_interval)

function mqtt_connect(serverip) {
    if (mqtt_client === null) {
        if (conf.usesecure === 'disable') {
            var connectOptions = {
                host: serverip,
                port: conf.cse.mqttport,
                protocol: "mqtt",
                keepalive: 10,
                clientId: 'TELE_LTE_' + nanoid(15),
                protocolId: "MQTT",
                protocolVersion: 4,
                clean: true,
                reconnectPeriod: 2000,
                connectTimeout: 2000,
                rejectUnauthorized: false
            }
        } else {
            connectOptions = {
                host: serverip,
                port: conf.cse.mqttport,
                protocol: "mqtts",
                keepalive: 10,
                clientId: 'TELE_LTE_' + nanoid(15),
                protocolId: "MQTT",
                protocolVersion: 4,
                clean: true,
                reconnectPeriod: 2000,
                connectTimeout: 2000,
                key: fs.readFileSync("./server-key.pem"),
                cert: fs.readFileSync("./server-crt.pem"),
                rejectUnauthorized: false
            }
        }

        mqtt_client = mqtt.connect(connectOptions)

        mqtt_client.on('connect', function () {
            console.log('mqtt is connected to (' + serverip + ')')

            if (my_command_name !== '') {  // GCS topic
                mqtt_client.subscribe(my_command_name, function () {
                    console.log('[mqtt_connect] my_command_name is subscribed: ' + my_command_name);
                });
            }
        })

        mqtt_client.on('message', function (topic, message) {
            if (topic === my_command_name) {
                if (local_mqtt_client !== null) {
                    local_mqtt_client.publish(pub_gcs_topic, message)
                    sh_adn.crtci(my_command_name + '?rcn=0', 0, message.toString('hex'), null, function () {
                    })
                }
            }
        })

        mqtt_client.on('error', function (err) {
            console.log('[mqtt] (error) ' + err.message)
        })
    }
}

var aggr_content = {}

function send_aggr_to_Mobius(topic, content_each, gap) {
    if (aggr_content.hasOwnProperty(topic)) {
        var timestamp = moment().format('YYYY-MM-DDTHH:mm:ssSSS')
        aggr_content[topic][timestamp] = content_each
    } else {
        aggr_content[topic] = {}
        timestamp = moment().format('YYYY-MM-DDTHH:mm:ssSSS')
        aggr_content[topic][timestamp] = content_each

        setTimeout(function () {
            sh_adn.crtci(topic + '?rcn=0', 0, aggr_content[topic], null, function () {
            })

            delete aggr_content[topic]
        }, gap, topic)
    }
}
