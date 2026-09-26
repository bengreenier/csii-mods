import { Component, ReactNode } from "react";
import mod from "mod.json";

interface Props {
    children: ReactNode;
}

interface State {
    failed: boolean;
}

// Anything appended to "Game" shares React's tree with the vanilla UI, so an
// uncaught render error would unmount the whole in-game UI. Contain it here.
export class ErrorBoundary extends Component<Props, State> {
    state: State = { failed: false };

    static getDerivedStateFromError(): State {
        return { failed: true };
    }

    componentDidCatch(error: unknown) {
        console.error(`[${mod.id}] UI error, disabling mod UI:`, error);
    }

    render() {
        return this.state.failed ? null : this.props.children;
    }
}
