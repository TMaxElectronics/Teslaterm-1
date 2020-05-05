import * as path from "path";
import {MediaFileType, PlayerActivity} from "../../common/CommonTypes";
import {TransmittedFile} from "../../common/IPCConstantsToMain";
import {commands} from "../connection/connection";
import {Scope} from "../ipc/Scope";
import {Terminal} from "../ipc/terminal";
import {kill_msg, midiOut} from "../midi/midi";
import {loadMidiFile} from "../midi/midi_file";
import {transientActive} from "../connection/telemetry";
import * as scripting from "../scripting";
import {loadSidFile} from "../sid/sid";

export function isSID(type: MediaFileType): boolean {
    return type === MediaFileType.sid_dmp || type === MediaFileType.sid_emulated;
}

export class PlayerState {
    public get currentFile(): TransmittedFile | undefined {
        return this.currentFileInt;
    }

    public get type(): MediaFileType {
        return this.typeInt;
    }

    public get state(): PlayerActivity {
        return this.stateInt;
    }

    public get title(): string {
        return this.titleInt;
    }

    public progress: number;
    private currentFileInt: TransmittedFile | undefined;
    private typeInt: MediaFileType;
    private startCallback: (() => Promise<void>) | undefined = undefined;
    private stopCallback: (() => void) | undefined = undefined;
    private titleInt: string | undefined;
    private stateInt: PlayerActivity = PlayerActivity.idle;

    public constructor() {
        this.currentFileInt = undefined;
        this.typeInt = MediaFileType.none;
        this.progress = 0;
        this.titleInt = undefined;
    }

    public async loadFile(
        file: TransmittedFile,
        type: MediaFileType,
        title: string,
        startCallback?: () => Promise<void>,
        stopCallback?: () => void,
    ) {
        this.titleInt = title;
        this.typeInt = type;
        this.currentFileInt = file;
        this.startCallback = startCallback;
        this.stopCallback = stopCallback;
        this.progress = 0;
        await commands.setSynth(type);
    }

    public async startPlaying(): Promise<void> {
        if (this.currentFile === null) {
            Terminal.println("Please select a media file using drag&drop");
            return;
        }
        if (this.state !== PlayerActivity.idle) {
            Terminal.println("A media file is currently playing, stop it before starting it again");
            return;
        }
        if (this.startCallback) {
            await this.startCallback();
        }
        this.stateInt = PlayerActivity.playing;
    }

    public stopPlaying(): void {
        midiOut.send(kill_msg);
        if (this.currentFile === null || this.state !== PlayerActivity.playing) {
            Terminal.println("No media file is currently playing");
            return;
        }
        if (this.stopCallback) {
            this.stopCallback();
        }
        this.stateInt = PlayerActivity.idle;
        Scope.updateMediaInfo();
        scripting.onMidiStopped();
    }
}


export let media_state = new PlayerState();

let lastTimeoutReset: number = 0;

export function checkTransientDisabled() {
    if (transientActive) {
        const currTime = new Date().getTime();
        if (currTime - lastTimeoutReset > 500) {
            commands.setTransientEnabled(false);
            lastTimeoutReset = currTime;
        }
    }
}

export async function loadMediaFile(file: TransmittedFile): Promise<void> {
    const extension = path.extname(file.name).substr(1).toLowerCase();
    if (extension === "mid") {
        await loadMidiFile(file);
    } else if (extension === "dmp" || extension === "sid") {
        await loadSidFile(file);
    } else {
        Terminal.println("Unknown extension: " + extension);
    }
}