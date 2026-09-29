// Places the (hidden) search field and anchors the wheel, once per open menu.
import { ReactNode, useState } from "react";
import { useValue } from "cs2/api";
import { useCssLength } from "cs2/utils";
import { openAtCursor$ } from "../../bindings";
import { menuScale$ } from "./bindings";
import { wheelFitRadius } from "./layout";
import { anchorAtCursor, useWheelGeometry, WheelAnchorContext } from "./wheel";

export const RadialFrame = ({ searchField, children }: { searchField: ReactNode; children: ReactNode }) => {
    // Fixed for as long as the menu is open (captured on open only, so the
    // buttons stay put while you move the mouse to them).
    const openAtCursor = useValue(openAtCursor$);
    const fitRadiusPx = useCssLength(`${wheelFitRadius(useWheelGeometry())}rem`) * useValue(menuScale$);
    const [anchor] = useState(() => (openAtCursor ? anchorAtCursor(fitRadiusPx) : null));

    // A fragment: the field and the wheel are direct children of the backdrop.
    return (
        <>
            {searchField}
            <WheelAnchorContext.Provider value={anchor}>{children}</WheelAnchorContext.Provider>
        </>
    );
};
