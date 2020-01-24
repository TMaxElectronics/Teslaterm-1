import {terminal} from "../gui/gui";
import * as helper from '../helper';
import * as ui_helper from '../gui/ui_helper';
import {onMidiNetworkConnect} from "./midi_client";
import {socket_midi} from "../network/connection";
import {
    midiAccess,
    midiIn,
    midiMessageReceived,
    midiOut,
    setMidiInAsNone,
    setMidiInToPort,
    setMidiOut,
    stopMidiOutput
} from "./midi";
import * as nano from "../nano";
import * as connection from "../network/connection";
import {ConnectionState} from "../network/telemetry";
import * as midiServer from "./midi_server";


let selectMidiIn: HTMLSelectElement;
let selectMidiOut: HTMLSelectElement;

export function init() {
    selectMidiIn=<HTMLSelectElement>document.getElementById("midiIn");
    selectMidiIn.onchange = onSelectMidiIn;
    selectMidiOut=<HTMLSelectElement>document.getElementById("midiOut");
    selectMidiOut.onchange = onSelectMidiOut;
}
export function populateMIDISelects() {
    // clear the MIDI input select
    selectMidiIn.options.length = 0;

    addElementKeepingSelected("None", "", midiIn.source, selectMidiIn);
    let networkText = "Network";
    const networkId = "<Network>";
    if (midiIn.source==networkId) {
        networkText = midiIn.data['remote'];
    }
    addElementKeepingSelected(networkText, networkId, midiIn.source, selectMidiIn);
    for (let input of midiAccess.inputs.values()) {
        const str = input.name.toString();
        const preferred = !midiIn.isActive() && ((str.indexOf("Tesla") != -1) || (str.toLowerCase().indexOf("keyboard") != -1));
        if (str.includes("nano")) {
            input.onmidimessage = midiMessageReceived;
            nano.setNano(input);
        }
        addElementKeepingSelected(input.name, input.id, midiIn.source, selectMidiIn, preferred)
    }
    onSelectMidiIn();
    selectMidiOut.options.length = 0;
    addElementKeepingSelected("None", "", midiOut.dest, selectMidiOut);
    if (connection.connState==ConnectionState.CONNECTED_IP) {
        addElementKeepingSelected("UD3 over Ethernet", "<Network>", midiOut.dest, selectMidiOut);
    }
    for (let output of midiAccess.outputs.values()) {
        const str = output.name.toString();
        if (str.includes("nano")) {
            nano.setNanoOut(output);
            nano.init();
        } else {
            addElementKeepingSelected(str, output.id, midiOut.dest, selectMidiOut, str.indexOf("UD3")>=0);
        }
    }
    onSelectMidiOut();
}

function enterFilterForMidi(result) {
    ui_helper.inputStrings("Please enter the filters", "MIDI filters", (channel, note)=>{
        const filterChannel = helper.parseFilter(channel);
        if (filterChannel==null) {
            return 0;
        }
        const filterNote = helper.parseFilter(note);
        if (filterNote==null) {
            return 1;
        }
        return -1;
    }, ["Channel", "Note"])
        .then(filter=>setMidiInToNetwork(result.ip, result.port, {channel: filter[0], note: filter[1]}));
}

function setMidiInToNetwork(ip: string, port: number, filter) {
    terminal.io.println("Connecting to MIDI server at "+ip+":"+port+"...");
    chrome.sockets.tcp.create({}, function(createInfo) {
        if (chrome.runtime.lastError) {
            terminal.io.println("Failed to create MIDI socket: " + chrome.runtime.lastError.message);
        } else {
            chrome.sockets.tcp.connect(createInfo.socketId,
                ip, port, s => {
                    if (chrome.runtime.lastError) {
                        terminal.io.println("Failed to connect to network MIDI: " + chrome.runtime.lastError.message);
                    } else {
                        onMidiNetworkConnect(s, ip, port, createInfo.socketId, filter);
                    }
                });
        }
    });
}

function onSelectMidiOut() {
    const selected = selectMidiOut.selectedIndex;
    const id = (<HTMLOptionElement>selectMidiOut[selected]).value;
    if (id!=midiOut.dest) {
        stopMidiOutput();
        if (id == "<Network>") {
            setMidiOut({
                send: (data) => chrome.sockets.tcp.send(socket_midi, data, () => {
                    if (chrome.runtime.lastError) {
                        console.log("Failed to send MIDI network data: " + chrome.runtime.lastError.message);
                    }
                }),
                dest: id
            });
        } else if (id) {
            const midiSink = midiAccess.outputs.get(id);
            setMidiOut({
                send: (data) => midiSink.send(<number[] | Uint8Array>data),
                dest: id
            });
        } else {
            setMidiOut({
                send: () => {
                },
                dest: id
            });
        }
        midiOut.dest = id;
    }
}

export function select(select: number) {
    selectMidiIn.selectedIndex = select;
}

function onSelectMidiIn() {
    const selected = selectMidiIn.selectedIndex;
    const id = (<HTMLOptionElement>selectMidiIn[selected]).value;
    if (id!=midiIn.source) {
        if (midiIn.isActive())
            midiIn.cancel(null);

        selectMidiIn.selectedIndex = selected;
        if (id=="<Network>") {
            midiServer.requestName()
                .then(()=>ui_helper.inputIpAndPort("Please enter the remote IP address", "MIDI over IP"))
                .then(enterFilterForMidi)
                .catch((err)=>{
                    console.log("Caught something!", err);
                    setMidiInAsNone();
                });
        } else if (id) {
            let midiSource = midiAccess.inputs.get(id);
            setMidiInToPort(midiSource);
        } else {
            setMidiInAsNone();
        }
    }
}

function addElementKeepingSelected(name, id, oldId, selector, forceSelect = false) {
    let preferred = forceSelect || id == oldId;
    selector.appendChild(new Option(name, id, preferred, preferred));
}