import {IPC_CONSTANTS_TO_MAIN, TransmittedFile} from "../../common/IPCConstantsToMain";
import {IPC_CONSTANTS_TO_RENDERER, ToastSeverity} from "../../common/IPCConstantsToRenderer";
import {Script} from "../scripting";
import {ipcs, MultiWindowIPC} from "./IPCProvider";

export class ScriptingIPC {
    private currentScript: Script | null = null;
    private activeConfirmationID = 0;
    private confirmationResolve: (confirmed: boolean) => void;
    private confirmationReject: () => void;
    private readonly processIPC: MultiWindowIPC;

    constructor(processIPC: MultiWindowIPC) {
        this.processIPC = processIPC;
        processIPC.on(IPC_CONSTANTS_TO_MAIN.script.confirmOrDeny, (msg) => {
            if (msg.requestID === this.activeConfirmationID && this.confirmationResolve) {
                this.confirmationResolve(msg.confirmed);
                this.confirmationReject = this.confirmationResolve = undefined;
            }
        });
        processIPC.on(IPC_CONSTANTS_TO_MAIN.script.startScript, () => this.startScript());
        processIPC.on(IPC_CONSTANTS_TO_MAIN.script.stopScript, () => this.stopScript());
    }

    public async startScript() {
        if (this.currentScript === null) {
            ipcs.misc.openGenericToast('Script', "Please select a script file using drag&drop first", ToastSeverity.info, 'no-script');
        } else {
            await this.currentScript.start();
        }
    }

    public stopScript() {
        if (this.currentScript === null) {
            ipcs.misc.openGenericToast('Script', "Please select a script file using drag&drop first", ToastSeverity.info, 'no-script');
        } else if (!this.currentScript.isRunning()) {
            ipcs.misc.openGenericToast('Script', "The script can not be stopped since it isn't running", ToastSeverity.info, 'script-not-running');
        } else {
            this.currentScript.cancel();
        }
    }

    public async loadScript(file: TransmittedFile) {
        try {
            this.currentScript = await Script.create(file.contents);
            ipcs.menu.setScriptName(file.name);
        } catch (e) {
            ipcs.misc.openGenericToast('Script', "Failed to load script: " + e, ToastSeverity.error, 'failed-script-load');
            console.log(e);
        }
    }

    public requestConfirmation(message: string, title?: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            if (this.confirmationReject) {
                this.confirmationReject();
            }
            ++this.activeConfirmationID;
            this.confirmationResolve = resolve;
            this.confirmationReject = reject;
            this.processIPC.send(
                IPC_CONSTANTS_TO_RENDERER.script.requestConfirm,
                {confirmationID: this.activeConfirmationID, message, title},
            );
        });
    }
}
