import React from "react";
import {TTComponent} from "../../TTComponent";

export abstract class CanvasComponent<Props, State> extends TTComponent<Props, State> {
    private readonly canvasRef: React.RefObject<HTMLCanvasElement>;
    private readonly divRef: React.RefObject<HTMLDivElement>;
    private readonly resizeListener: () => any;

    protected constructor(props: any) {
        super(props);
        this.canvasRef = React.createRef();
        this.divRef = React.createRef();
        this.resizeListener = () => this.refresh();
    }

    render(): React.ReactNode {
        return <div ref={this.divRef}>
            <canvas ref={this.canvasRef} className={'tt-canvas'}/>
        </div>;
    }

    componentDidMount() {
        window.addEventListener('resize', this.resizeListener);
        this.refresh();
    }

    componentWillUnmount() {
        super.componentWillUnmount();
        window.removeEventListener('resize', this.resizeListener);
    }

    componentDidUpdate(prevProps: Props) {
        this.refresh();
    }

    protected abstract draw(ctx: CanvasRenderingContext2D, width: number, height: number);

    private refresh() {
        const canvas = this.canvasRef.current;
        const div = this.divRef.current;
        const ctx = canvas && canvas.getContext('2d');
        if (!canvas || !div || !ctx) {
            return;
        }
        canvas.height = div.offsetHeight;
        canvas.width = div.offsetWidth;
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        this.draw(ctx, canvas.width, canvas.height);
    }
}
