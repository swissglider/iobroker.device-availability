/*
 * Created with @iobroker/create-adapter v1.29.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';

let timer: NodeJS.Timeout;

// Load your modules here, e.g.:
// import * as fs from "fs";

// Augment the adapter.config object with the actual types
// TODO: delete this in the next version
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace ioBroker {
        interface AdapterConfig {
            // Or use a catch-all approach
            [key: string]: any;
        }
    }
}

class DeviceAvailability extends utils.Adapter {
    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'device-availability',
        });
        this.on('ready', this.onReady.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
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
        await this.setObjectNotExistsAsync('lastCheck', {
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
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private onUnload(callback: () => void): void {
        try {
            if (timer) {
                clearTimeout(timer);
            }

            callback();
        } catch (e) {
            callback();
        }
    }

    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    /**
     * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
     * Using this method requires "common.message" property to be set to true in io-package.json
     */
    private async onMessage(obj: ioBroker.Message): Promise<void> {
        if (typeof obj === 'object' && obj.message) {
            if (obj.command === 'shortTest') {
                // runs a test to get all the Not available states within the given Time (the device is not available.)
                const params = <Record<string, any>>obj.message;
                const milliseconds = parseInt(<string>params.milliseconds);
                const allRelevantStates: (string | ioBroker.State)[][] = await this.getAllNotAvailableStates(
                    milliseconds,
                );
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, JSON.stringify(allRelevantStates), obj.callback);
                }
            } else if (obj.command === 'runTest') {
                // runs a standard test call with the configured parameters
                const allRelevantStates: (string | ioBroker.State)[][] = await this.getAllNotAvailableStates(
                    this.config.milliseconds_of_not_available,
                );
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, JSON.stringify(allRelevantStates), obj.callback);
                }
            } else if (obj.command === 'getLastCheck') {
                // gets the list of the last run
                const allRelevantStates = await this.getStateAsync('lastCheck');
                if (obj.callback && allRelevantStates) {
                    this.sendTo(obj.from, obj.command, JSON.stringify(allRelevantStates.val), obj.callback);
                }
            } else if (obj.command === 'storeState' && obj.from.includes('system.adapter.influxdb')) {
                this.log.info('Message from InfluxDB : ' + JSON.stringify(obj.message));
            } else {
                this.log.error('New Message: ' + obj.command + ' : ' + JSON.stringify(obj.message) + ' : ' + obj.from);
            }
        }
    }

    private harmoniseCollection(collection: string[]): string[] {
        const newColl: string[] = [];
        collection
            .filter((e) => !e.startsWith('//'))
            .forEach((el: string) => {
                if (el.includes('//')) {
                    el = el.substring(0, el.indexOf('//')).replace(/\s/g, '');
                }
                newColl.push(el);
            });
        return newColl;
    }

    private async timerToStart(): Promise<void> {
        timer = setTimeout(() => this.timerToStart(), this.config.check_interval);

        const allRelevantStates: (string | ioBroker.State)[][] = await this.getAllNotAvailableStates(
            this.config.milliseconds_of_not_available,
        );

        allRelevantStates.forEach(async (x) => {
            const tempID: string = x[0].toString();
            const tempState = <ioBroker.State>x[1];
            const tempObject = await this.getForeignObjectAsync(tempID);
            if (tempObject) {
                const errorString =
                    'Device: ' +
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
        });

        await this.setStateAsync('lastCheck', JSON.stringify(allRelevantStates));
    }

    private async sendToPushover(message: string): Promise<void> {
        await this.sendToAsync('pushover', {
            message: message,
            title: 'Device not reable',
            priority: 1,
        });
    }

    private async sendToInflux(message: string): Promise<void> {
        await this.sendTo('influxdb', 'storeState', {
            id: 'Device.not.available',
            state: { ts: Date.now(), val: message, ack: true, from: 'device-availability', q: 0 },
        });
    }

    private async getAllNotAvailableStates(timeMaxNotAvailableInMS: number): Promise<(string | ioBroker.State)[][]> {
        const states = await this.getForeignStatesAsync('*');
        const newIncludeCollection = this.harmoniseCollection(this.config.includeCollection);
        const newExcludeCollection = this.harmoniseCollection(this.config.excludeCollection);
        const toCheck = new Date().getTime() - timeMaxNotAvailableInMS;
        const allRelevantStates = [];
        for (const [key, value] of Object.entries(states)) {
            if (
                value &&
                newIncludeCollection.some((x: string) => key.includes(x)) &&
                !newExcludeCollection.some((x: string) => key.includes(x))
            ) {
                if ('ts' in value && value.ts < toCheck) {
                    allRelevantStates.push([key, value]);
                }
            }
        }
        return allRelevantStates;
    }
}

if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new DeviceAvailability(options);
} else {
    // otherwise start the instance directly
    (() => new DeviceAvailability())();
}
