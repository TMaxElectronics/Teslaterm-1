import {app} from "electron";
import fs from "fs";
import JSZip from "jszip";
import {SynthType, synthTypeToString} from "../../../common/CommonTypes";
import {ACK_BYTE, RESET} from "../../min/MINConstants";
import {MINReceiver, ReceivedMINFrame} from "../../min/MINReceiver";
import {TelemetryChannel} from "../telemetry/TelemetryChannel";
import {TelemetryFrame} from "../telemetry/TelemetryFrame";
import {SYNTH_CMD_FLUSH, UD3MinIDs} from "../types/UD3MINConstants";
import {FlightEventType, FlightRecorderEvent} from "./FlightRecorder";
import {FlightRecorderJSON, FRMeterConfigs, FRScopeConfigs} from "./FlightRecordingWorker";

export interface MINFlightEvent {
    frame: ReceivedMINFrame;
    time: number;
    toUD3: boolean;
}

export interface FlightRecordingStartData {
    meterConfigs: FRMeterConfigs;
    traceConfigs: FRScopeConfigs;
}

export async function parseEventsFromFile(zipData: Buffer): Promise<[FlightRecorderEvent[], FlightRecordingStartData]> {
    const zip = await JSZip.loadAsync(zipData);
    const dataFile = zip.file('data.json');
    const jsonString = await dataFile.async('string');
    const jsonData: FlightRecorderJSON = JSON.parse(jsonString);
    return [
        jsonData.events.map(stored => ({
            data: Buffer.from(stored.data, 'base64'),
            time_us: stored.time_us,
            type: stored.type,
        })),
        {
            meterConfigs: jsonData.initialMeterConfig,
            traceConfigs: jsonData.initialScopeConfig,
        },
    ];
}

// TODO include connection changes etc
// TODO highlight bad MIN data at some point
export function parseMINEvents(flightEvents: FlightRecorderEvent[]): MINFlightEvent[] {
    const minEvents: MINFlightEvent[] = [];
    const ttReceiver = new MINReceiver();
    const ud3Receiver = new MINReceiver();
    for (const flightEvent of flightEvents) {
        let eventReceiver: MINReceiver;
        switch (flightEvent.type) {
            case FlightEventType.data_to_ud3:
                eventReceiver = ud3Receiver;
                break;
            case FlightEventType.data_from_ud3:
                eventReceiver = ttReceiver;
                break;
        }
        if (!eventReceiver) {
            continue;
        }
        for (const byte of flightEvent.data) {
            const maybeFrame = eventReceiver.receiveByte(byte);
            if (maybeFrame) {
                minEvents.push({
                    frame: maybeFrame,
                    time: flightEvent.time_us,
                    toUD3: flightEvent.type === FlightEventType.data_to_ud3,
                });
            }
        }
    }
    return minEvents;
}

function uint8sToString(data: Iterable<number>) {
    let result = '';
    for (const char of data) {
        result += String.fromCharCode(char);
    }
    return result;
}

function toSafeString(data: Iterable<number>): string {
    return makeStringSafe(uint8sToString(data));
}

function cleanFormatting(formatted: string): string {
    return formatted.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
        // TODO any issues on Windows?
        .replace(/\r\n/g, '\n');
}

function makeStringSafe(unsafe: string): string {
    let result = '';
    for (const char of new Buffer(unsafe)) {
        const charStr = String.fromCharCode(char);
        let special: string;
        if (charStr === '\r') {
            special = '\\r';
        } else if (char === 0x1B) {
            special = 'ESC';
        }
        if (!special && (charStr === '\n' || charStr === '\t' || (char >= 0x20 && char <= 0x7e))) {
            result += String.fromCharCode(char);
        } else {
            result += '[' + (special || ('0x' + char.toString(16))) + ']';
        }
    }
    return result;
}

function describeTelemetry(frame: TelemetryFrame, appID: number): string {
    // TODO
    return 'Telemetry on ' + appID + ': ' + JSON.stringify(frame);
}

export function parseEventsForDisplay(minEvents: MINFlightEvent[]): ParsedEvent[] {
    const humanEvents: ParsedEvent[] = [];
    const telemetryParsers = [new TelemetryChannel(), new TelemetryChannel(), new TelemetryChannel()];
    for (const minEvent of minEvents) {
        // TODO handle seq mismatches and other MIN issues, partially already during conversion to MIN
        const frame = minEvent.frame;
        if (frame.id_control === ACK_BYTE || frame.id_control === RESET) {
            // TODO report resets
            continue;
        }
        const appID = frame.id_control & 0x7f;
        if (appID === UD3MinIDs.WATCHDOG) {
            continue;
        }
        const addEvent = (desc: string) => humanEvents.push({desc, time: minEvent.time, toUD3: minEvent.toUD3});
        // TODO should this just be the fallback path?
        if (appID < 4) {
            let printed = '';
            if (minEvent.toUD3) {
                printed = uint8sToString(frame.payload);
            } else {
                telemetryParsers[appID].processBytes(
                    frame.payload,
                    (s) => printed += s,
                    (tFrame) => addEvent(describeTelemetry(tFrame, appID)),
                );
            }
            if (printed !== '') {
                printed = cleanFormatting(printed);
                printed = makeStringSafe(printed);
                humanEvents.push({
                    desc: 'Data on terminal ' + appID + ':\n' + printed,
                    time: minEvent.time,
                    toUD3: minEvent.toUD3,
                });
            }
        } else if (appID === UD3MinIDs.FEATURE && !minEvent.toUD3) {
            addEvent('Feature support: ' + toSafeString(frame.payload));
        } else if (appID === UD3MinIDs.SOCKET && minEvent.toUD3) {
            const id = frame.payload[0];
            const type = frame.payload[1] ? 'Starting' : 'Stopping';
            addEvent(`${type} terminal ${id}: ${toSafeString(frame.payload.slice(2, frame.payload.length - 1))}`);
        } else if (appID === UD3MinIDs.SYNTH && minEvent.toUD3 && frame.payload.length === 1) {
            if (frame.payload[0] === SYNTH_CMD_FLUSH) {
                addEvent('Synth flush');
            } else {
                addEvent('Setting synth to ' + synthTypeToString(frame.payload[0]));
            }
        } else {
            humanEvents.push({
                desc: `Unexpected ID ${frame.id_control} (${appID}), payload ${frame.payload}`,
                time: minEvent.time,
                toUD3: minEvent.toUD3,
            });
        }
    }
    return humanEvents;
}

// TODO temp
async function main() {
    const zipData = await fs.promises.readFile('tt-flight-recording-1689790979688.zip');
    const [flightEvents, initialState] = await parseEventsFromFile(zipData);
    const minEvents = parseMINEvents(flightEvents);
    const displayEvents = parseEventsForDisplay(minEvents);
    if (displayEvents.length === 0) { return; }
    console.log('Initial meter state:');
    for (const id of Object.keys(initialState.meterConfigs)) {
        console.log(`Meter ${id} is configured as ${JSON.stringify(initialState.meterConfigs[id])}`);
    }
    console.log('Initial trace state:');
    for (const id of Object.keys(initialState.traceConfigs)) {
        console.log(`Trace ${id} is configured as ${JSON.stringify(initialState.traceConfigs[id])}`);
    }
    const endTime = displayEvents[displayEvents.length - 1].time;
    for (const displayEvent of displayEvents) {
        let msg = 'MIN message ';
        msg += displayEvent.toUD3 ? '  to' : 'from';
        let time = ((displayEvent.time - endTime ) / 1e6).toFixed(4);
        while (time.length < 10) {
            time = ' ' + time;
        }
        msg += ' UD3 at ' + time + ' s: ';
        msg += displayEvent.desc;
        console.log(msg);
    }
}

main().catch(err => console.log(err));
