import {PlayerActivity} from "../../../common/CommonTypes";
import {ConnectionStatus, ToastSeverity} from "../../../common/IPCConstantsToRenderer";
import {ipcs} from "../../ipc/IPCProvider";
import * as media from "../../media/media_player";
import {BootloadableConnection} from "../bootloader/bootloadable_connection";
import {commands} from "../connection";
import {TerminalHandle, UD3Connection} from "../types/UD3Connection";
import {IConnectionState} from "./IConnectionState";
import {Idle} from "./Idle";
import {Reconnecting} from "./Reconnecting";

const TIMEOUT = 1000;
let lastResponseTime = Date.now();

export function resetResponseTimeout() {
    lastResponseTime = Date.now();
}

export class Connected implements IConnectionState {
    private readonly activeConnection: UD3Connection;
    private readonly autoTerminal: TerminalHandle;

    public constructor(conn: UD3Connection, autoTerm: TerminalHandle) {
        this.activeConnection = conn;
        this.autoTerminal = autoTerm;
    }

    public getActiveConnection(): UD3Connection | undefined {
        return this.activeConnection;
    }

    public getConnectionStatus(): ConnectionStatus {
        return ConnectionStatus.CONNECTED;
    }

    public async pressButton(window: object): Promise<IConnectionState> {
        try {
            await this.disconnectInternal();
            ipcs.terminal.onConnectionClosed();
        } catch (err) {
            console.error("While disconnecting:", err);
        }
        return new Idle();
    }

    public tickFast(): IConnectionState {
        this.activeConnection.tick();

        if (this.isConnectionLost()) {
            ipcs.misc.openToast(
                'Connection lost', 'Lost connection, will attempt to reconnect', ToastSeverity.warning, 'will-reconnect'
            );
            this.activeConnection.disconnect();
            ipcs.terminal.onConnectionClosed();
            return new Reconnecting(this.activeConnection);
        }

        return this;
    }

    public tickSlow() {
        this.activeConnection.resetWatchdog();
    }

    public getAutoTerminal(): TerminalHandle | undefined {
        return this.autoTerminal;
    }

    private isConnectionLost(): boolean {
        if (this.activeConnection instanceof BootloadableConnection) {
            const bootConnection = this.activeConnection as BootloadableConnection;
            if (bootConnection.isBootloading()) {
                // TODO detect lost connection in bootloader mode (and fully disconnect)?
                return false;
            }
        }
        return Date.now() - lastResponseTime > TIMEOUT;
    }

    private async disconnectInternal() {
        try {
            if (media.media_state.state === PlayerActivity.playing) {
                media.media_state.stopPlaying();
            }
            await commands.stop();
        } catch (e) {
            console.error("Failed to send stop command:", e);
        }
        await this.activeConnection.disconnect();
    }
}
