// How each query token is coloured (see query/parser.ts TokenStatus).
import { TokenStatus } from "./query/parser";
import styles from "./shared.module.scss";

export const TOKEN_CLASS: Record<TokenStatus, string | undefined> = {
    text: undefined,
    filter: styles.tokenFilter,
    incomplete: styles.tokenIncomplete,
    invalid: styles.tokenInvalid,
    unknown: styles.tokenInvalid,
    ignored: styles.tokenIncomplete,
};
