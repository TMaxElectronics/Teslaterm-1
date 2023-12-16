import {ConnectionOptions} from "../../common/ConnectionOptions";
import {CoilID} from "../../common/constants";
import {ConnectionStatus} from "../../common/IPCConstantsToRenderer";
import {CommandRole} from "../../common/Options";
import {ipcs} from "../ipc/IPCProvider";
import {media_state} from "../media/media_player";
import {CommandInterface} from "./commands";
import {FlightEventType, getFlightRecorder} from "./flightrecorder/FlightRecorder";
import {Connected} from "./state/Connected";
import {Connecting} from "./state/Connecting";
import {IConnectionState} from "./state/IConnectionState";
import {Idle} from "./state/Idle";
import {TerminalHandle, UD3Connection} from "./types/UD3Connection";

const connectionState: Map<CoilID, IConnectionState> = new Map<CoilID, IConnectionState>();

export function getCoilCommands(coil: CoilID) {
    return new CommandInterface(coil);
}

export function getConnectionState(coil: CoilID) {
    if (!connectionState.has(coil)) {
        connectionState.set(coil, new Idle());
    }
    return connectionState.get(coil);
}

export function getCoils() {
    return connectionState.keys();
}

export function clearCoils() {
    connectionState.clear();
    // TODO clear e.g. SID caches
}

export function forEachCoilAsync<T>(apply: (coil: CoilID) => Promise<T>) {
    return Promise.all([...getCoils()].map(apply));
}

export function forEachCoil<T>(apply: (coil: CoilID) => T) {
    return [...getCoils()].map(apply);
}

export function setConnectionState(coil: CoilID, newState: IConnectionState) {
    const lastStatus = connectionState.has(coil) ?
        connectionState.get(coil).getConnectionStatus() :
        ConnectionStatus.IDLE;
    connectionState.set(coil, newState);
    const newStatus = newState.getConnectionStatus();
    if (newStatus !== lastStatus) {
        console.log('Update on ', coil, ':', newStatus);
        ipcs.coilMisc(coil).setConnectionState(newStatus);
        getFlightRecorder(coil).addEvent(FlightEventType.connection_state_change, [newStatus]);
    }
}

export async function startConf(coil: CoilID, commandState: CommandRole) {
    const commands = getCoilCommands(coil);
    const sliderIPC = ipcs.sliders(coil);
    await commands.sendCommand('\r');
    if (commandState === "disable") {
        await sliderIPC.setAbsoluteOntime(0);
    } else {
        await sliderIPC.setRelativeOntime(0);
    }
    await commands.setBPS(sliderIPC.bps);
    await commands.setBurstOntime(sliderIPC.burstOntime);
    await commands.setBurstOfftime(sliderIPC.burstOfftime);
    await getUD3Connection(coil).setSynthByFiletype(media_state.type, false);
    await commands.resetKill();
    await commands.startTelemetry();
}

export async function pressButton(coil: CoilID, window: object) {
    console.log('Pressed button on ', coil);
    setConnectionState(coil, await getConnectionState(coil).pressButton(window));
}

export function startBootloading(coil: CoilID, cyacd: Uint8Array): boolean {
    const coilState = getConnectionState(coil);
    if (coilState instanceof Connected) {
        const newConnection = coilState.startBootloading(cyacd);
        if (newConnection) {
            setConnectionState(coil, newConnection);
            return true;
        }
    }
    return false;
}


export function updateFast() {
    for (const [coil, coilState] of connectionState.entries()) {
        setConnectionState(coil, coilState.tickFast());
    }
}

export function updateSlow(): void {
    for (const coilState of connectionState.values()) {
        coilState.tickSlow();
    }
}

export function getUD3Connection(coil: CoilID): UD3Connection {
    const ret = getConnectionState(coil).getActiveConnection();
    if (!ret) {
        throw new Error("No connection is currently active");
    }
    return ret;
}

export function getOptionalUD3Connection(coil: CoilID): UD3Connection | undefined {
    return getConnectionState(coil).getActiveConnection();
}

export function getAutoTerminal(coil: CoilID): TerminalHandle | undefined {
    return getConnectionState(coil).getAutoTerminal();
}

export function hasUD3Connection(coil: CoilID): boolean {
    return getConnectionState(coil).getActiveConnection() !== undefined;
}

export async function connectWithOptions(args: ConnectionOptions) {
    const id = makeNewCoilID();
    // TODO sort of a hack, I guess
    const connection = await Idle.connectWithOptions(id, args);
    if (connection) {
        setConnectionState(id, new Connecting(connection, new Idle(), args.advanced));
    }
}

let nextCoilID = 0;

function makeNewCoilID(): CoilID {
    const id: CoilID = nextCoilID++;
    ipcs.initCoilIPC(id);
    return id;
}
