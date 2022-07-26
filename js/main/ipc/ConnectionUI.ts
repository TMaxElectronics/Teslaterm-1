import {IPC_CONSTANTS_TO_MAIN} from "../../common/IPCConstantsToMain";
import {AutoSerialPort, IPC_CONSTANTS_TO_RENDERER, IUDPConnectionSuggestion} from "../../common/IPCConstantsToRenderer";
import {connectWithOptions} from "../connection/connection";
import {sendConnectionSuggestions} from "../connection/types/Suggestions";
import {MultiWindowIPC} from "./IPCProvider";

export class ConnectionUIIPC {
    private readonly processIPC: MultiWindowIPC;

    constructor(processIPC: MultiWindowIPC) {
        this.processIPC = processIPC;
        this.processIPC.on(IPC_CONSTANTS_TO_MAIN.connect, (source: object, args: any) => {
            connectWithOptions(args);
        });
        this.processIPC.on(IPC_CONSTANTS_TO_MAIN.requestConnectSuggestions, sendConnectionSuggestions);
    }

    public suggestUDP(key: object, suggestions: IUDPConnectionSuggestion[]) {
        this.processIPC.sendToWindow(IPC_CONSTANTS_TO_RENDERER.connect.setUDPSuggestions, key, suggestions);
    }

    public suggestSerial(key: object, ports: string[]) {
        this.processIPC.sendToWindow(IPC_CONSTANTS_TO_RENDERER.connect.setSerialSuggestions, key, ports);
    }

    public sendConnectionError(error: string) {
        this.processIPC.sendToAll(IPC_CONSTANTS_TO_RENDERER.connect.connectionError, error);
    }

    public sendAutoOptions(options: AutoSerialPort[]) {
        this.processIPC.sendToAll(IPC_CONSTANTS_TO_RENDERER.connect.showAutoPortOptions, options);
    }
}
