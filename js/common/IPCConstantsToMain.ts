import {ConnectionOptions} from './ConnectionOptions';
import {CoilID, coilSuffix} from "./constants";
import {ConnectionPreset} from "./IPCConstantsToRenderer";

// The type parameter is purely a compile-time safeguard to make sure both sides agree on what data should be sent over
// this channel
export interface IPCToMainKey<Type> {
    channel: string;
}

function makeKey<Type>(channel: string): IPCToMainKey<Type> {
    return {channel};
}

export const IPC_CONSTANTS_TO_MAIN = {
    clearCoils: makeKey<undefined>('clear-coils'),
    commands: {
        setAllKillState: makeKey<boolean>('set-kill-state'),
        setBusState: makeKey<boolean>('set-bus-state'),
        setTRState: makeKey<boolean>('set-tr-state'),
    },
    connect: {
        connect: makeKey<ConnectionOptions>('connect-to-ud3'),
        getPresets: makeKey<undefined>('get-connect-presets'),
        requestSuggestions: makeKey<undefined>('request-connect-suggestions'),
        setPresets: makeKey<ConnectionPreset[]>('set-connect-presets'),
    },
    loadFile: makeKey<DroppedFile>('load-file'),
    loadFlightRecording: makeKey<number[]>('load-flight-recording'),
    menu: {
        startMedia: makeKey<undefined>('start-media'),
        stopMedia: makeKey<undefined>('stop-media'),
    },
    midiMessage: makeKey<Uint8Array>('midi-message'),
    requestFullSync: makeKey<undefined>('request-full-sync'),
    script: {
        confirmOrDeny: makeKey<ConfirmReply>('script-confirm'),
        startScript: makeKey<undefined>('start-script'),
        stopScript: makeKey<undefined>('stop-script'),
    },
    setDarkMode: makeKey<boolean>('setDarkMode'),
    sliders: {
        setBPS: makeKey<number>('slider-set-bps'),
        setBurstOfftime: makeKey<number>('slider-set-burst-offtime'),
        setBurstOntime: makeKey<number>('slider-set-burst-ontime'),
        setOntimeRelative: makeKey<number>('slider-set-ontime-rel'),
    },

};

export function getToMainIPCPerCoil(coil: CoilID) {
    const suffix = coilSuffix(coil);
    const makeCoilKey = <Type>(channel: string) => makeKey<Type>(channel + suffix);
    return {
        commands: {
            saveEEPROM: makeCoilKey<undefined>('save-eeprom'),
            setBusState: makeCoilKey<boolean>('set-bus-state'),
            setKillState: makeCoilKey<boolean>('set-kill-state'),
            setParms: makeCoilKey<Map<string, string>>('set-parms'),
            setTRState: makeCoilKey<boolean>('set-tr-state'),
        },
        dumpFlightRecorder: makeCoilKey<undefined>('dump-flight-recorder'),
        manualCommand: makeCoilKey<string>('manual-command'),
        menu: {
            connectButton: makeCoilKey<undefined>('press-connect-button'),
            downloadUD3ConfigElectron: makeCoilKey<undefined>('download-ud-config-electron'),
            requestAlarmList: makeCoilKey<undefined>('request-alarms'),
            requestUDConfig: makeCoilKey<undefined>('request-ud-config'),
        },
        sliders: {
            setBPS: makeCoilKey<number>('slider-set-bps'),
            setBurstOfftime: makeCoilKey<number>('slider-set-burst-offtime'),
            setBurstOntime: makeCoilKey<number>('slider-set-burst-ontime'),
            setOntimeAbsolute: makeCoilKey<number>('slider-set-ontime-abs'),
            setOntimeRelative: makeCoilKey<number>('slider-set-ontime-rel'),
        },
    };
}

export class TransmittedFile {
    public readonly name: string;
    public readonly contents: Uint8Array;

    constructor(name: string, contents: Uint8Array) {
        this.name = name;
        this.contents = contents;
    }
}

export class ConfirmReply {
    public readonly confirmed: boolean;
    public readonly requestID: number;

    constructor(confirmed: boolean, id: number) {
        this.confirmed = confirmed;
        this.requestID = id;
    }
}

export interface DroppedFile {
    name: string;
    bytes: number[];
    coil?: CoilID;
}
