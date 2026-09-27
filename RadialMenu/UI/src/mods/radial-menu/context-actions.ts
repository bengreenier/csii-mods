// The one place that decides which actions a right-clicked wheel item offers.
// An empty list means no context menu opens for it.
import { useCallback } from "react";
import { ContextAction, ContextTarget } from "./context-menu";

export type ContextActionProvider = (target: ContextTarget) => ContextAction[];

export function useContextActions(): ContextActionProvider {
    return useCallback((target: ContextTarget): ContextAction[] => {
        switch (target.kind) {
            case "asset":
                return [];
        }
    }, []);
}
