import {DropdownButton} from "react-bootstrap";
import Dropdown from "react-bootstrap/Dropdown";
import {TTComponent} from "../../../TTComponent";

export interface InstrumentChoice {
    currentChoice: number;
    setValue: (val: number) => any;
    available: string[];
}

export interface MixerColumnProps {
    title: string;
    setValue: (val: number) => any;
    value: number;
    program?: InstrumentChoice;
}

export class MixerColumn extends TTComponent<MixerColumnProps, {}> {
    public render() {
        return <div className={'tt-mixer-slider-outer-box'}>
            <div className={'tt-mixer-slider-box'}>
                <input
                    className={'tt-vertical-slider'}
                    type={'range'}
                    min={0}
                    max={100}
                    value={this.props.value}
                    onChange={(e) => this.props.setValue(e.target.valueAsNumber)}
                />

                {this.props.title}

                {this.renderProgramSelector()}
            </div>
        </div>;
    }

    private renderProgramSelector() {
        const programChoice = this.props.program;
        if (programChoice) {
            const items = programChoice.available.map(
                (name, id) => {
                    const css = id === programChoice.currentChoice ? {color: 'darkgreen'} : {};
                    return <Dropdown.Item
                        onClick={() => programChoice.setValue(id)}
                        key={id}
                        style={css}
                    >
                        {name}
                    </Dropdown.Item>;
                },
            );
            const currentName = programChoice.available[programChoice.currentChoice] ||
                `Unknown (${programChoice.currentChoice})`;
            return <DropdownButton
                title={currentName}
                size={'sm'}
                drop={'up'}
            >
                {...items}
            </DropdownButton>;
        } else {
            return <></>;
        }
    }
}