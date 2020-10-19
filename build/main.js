"use strict";
/*
 * Created with @iobroker/create-adapter v1.29.1
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
let timer;
class DeviceAvailability extends utils.Adapter {
    constructor(options = {}) {
        super(Object.assign(Object.assign({}, options), { name: 'device-availability' }));
        this.on('ready', this.onReady.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    onReady() {
        return __awaiter(this, void 0, void 0, function* () {
            // Initialize your adapter here
            // The adapters config (in the instance object everything under the attribute "native") is accessible via
            // this.config:
            // this.log.info('configs milliseconds_of_not_available: ' + this.config.milliseconds_of_not_available);
            // this.log.info('configs check_interval: ' + this.config.check_interval);
            // this.log.info('configs alarm_to_pushover: ' + this.config.alarm_to_pushover);
            // this.log.info('configs includeCollection: ' + this.config.includeCollection);
            // this.log.info('configs excludeCollection: ' + this.config.excludeCollection);
            /*
            For every state in the system there has to be also an object of type state
            Here a simple template for a boolean variable named "testVariable"
            Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
            */
            yield this.setObjectNotExistsAsync('lastCheck', {
                type: 'state',
                common: {
                    name: 'testVariable',
                    type: 'string',
                    role: 'result',
                    read: true,
                    write: false,
                },
                native: {},
            });
            this.timerToStart();
        });
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        try {
            if (timer) {
                clearTimeout(timer);
            }
            callback();
        }
        catch (e) {
            callback();
        }
    }
    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    /**
     * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
     * Using this method requires "common.message" property to be set to true in io-package.json
     */
    onMessage(obj) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof obj === 'object' && obj.message) {
                if (obj.command === 'helloCommand') {
                    this.log.warn('Hello Command with the following message arrived: ' + obj.message);
                    const allRelevantStates = yield this.getAllNotAvailableStates(this.config.milliseconds_of_not_available);
                    if (obj.callback) {
                        this.log.error('sent to callback');
                        this.sendTo(obj.from, obj.command, JSON.stringify(allRelevantStates), obj.callback);
                    }
                }
                if (obj.command === 'storeState' && obj.from.includes('system.adapter.influxdb')) {
                    this.log.info('Message from InfluxDB : ' + JSON.stringify(obj.message));
                }
                else {
                    this.log.error('New Message: ' + obj.command + ' : ' + JSON.stringify(obj.message) + ' : ' + obj.from);
                }
            }
        });
    }
    harmoniseCollection(collection) {
        const newColl = [];
        collection
            .filter((e) => !e.startsWith('//'))
            .forEach((el) => {
            if (el.includes('//')) {
                el = el.substring(0, el.indexOf('//')).replace(/\s/g, '');
            }
            newColl.push(el);
        });
        return newColl;
    }
    timerToStart() {
        return __awaiter(this, void 0, void 0, function* () {
            timer = setTimeout(() => this.timerToStart(), this.config.check_interval);
            const allRelevantStates = yield this.getAllNotAvailableStates(this.config.milliseconds_of_not_available);
            allRelevantStates.forEach((x) => __awaiter(this, void 0, void 0, function* () {
                const tempID = x[0].toString();
                const tempState = x[1];
                const tempObject = yield this.getForeignObjectAsync(tempID);
                if (tempObject) {
                    const errorString = 'Device: ' +
                        tempObject.common.name +
                        ' (' +
                        tempID +
                        ')' +
                        ' - LastTimestamp: ' +
                        new Date(tempState.ts).toLocaleString();
                    this.log.error(errorString);
                    if (this.config.alarm_to_pushover) {
                        this.sendToPushover(errorString);
                    }
                    if (this.config.alarm_to_influx) {
                        this.sendToInflux(tempID);
                    }
                }
            }));
            yield this.setStateAsync('lastCheck', JSON.stringify(allRelevantStates));
        });
    }
    sendToPushover(message) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.sendToAsync('pushover', {
                message: message,
                title: 'Device not reable',
                priority: 1,
            });
        });
    }
    sendToInflux(message) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.sendTo('influxdb', 'storeState', {
                id: 'Device.not.available',
                state: { ts: Date.now(), val: message, ack: true, from: 'device-availability', q: 0 },
            });
        });
    }
    getAllNotAvailableStates(timeMaxNotAvailableInMS) {
        return __awaiter(this, void 0, void 0, function* () {
            const states = yield this.getForeignStatesAsync('*');
            const newIncludeCollection = this.harmoniseCollection(this.config.includeCollection);
            const newExcludeCollection = this.harmoniseCollection(this.config.excludeCollection);
            const toCheck = new Date().getTime() - timeMaxNotAvailableInMS;
            const allRelevantStates = [];
            for (const [key, value] of Object.entries(states)) {
                if (value &&
                    newIncludeCollection.some((x) => key.includes(x)) &&
                    !newExcludeCollection.some((x) => key.includes(x))) {
                    if ('ts' in value && value.ts < toCheck) {
                        allRelevantStates.push([key, value]);
                    }
                }
            }
            return allRelevantStates;
        });
    }
}
if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options) => new DeviceAvailability(options);
}
else {
    // otherwise start the instance directly
    (() => new DeviceAvailability())();
}
