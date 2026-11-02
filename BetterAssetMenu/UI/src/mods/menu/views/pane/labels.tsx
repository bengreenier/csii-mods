// The pane's breadcrumb (place-labels.tsx has the shared wording).
import { Fragment } from "react";
import classNames from "classnames";
import { Crumb } from "../../navigation";
import { CrumbText } from "../../place-labels";
import styles from "./pane.module.scss";

export { PlaceLabel } from "../../place-labels";

// Each crumb in its own element, laid out in a row.
export const Trail = ({ crumbs }: { crumbs: Crumb[] }) => (
    <div className={styles.trail}>
        {crumbs.length === 0 ? (
            <div className={styles.crumb}>Top</div>
        ) : (
            crumbs.map((crumb, i) => (
                <Fragment key={i}>
                    {i > 0 && <div className={classNames(styles.crumb, styles.crumbSeparator)}>{">"}</div>}
                    <div className={styles.crumb}>
                        <CrumbText crumb={crumb} />
                    </div>
                </Fragment>
            ))
        )}
    </div>
);
