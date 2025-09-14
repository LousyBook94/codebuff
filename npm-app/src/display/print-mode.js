import { originalConsoleError, originalConsoleLog } from './overrides';
let printModeEnabled = false;
export function setPrintMode(enabled) {
    printModeEnabled = enabled;
}
export function printModeIsEnabled() {
    return printModeEnabled ?? false;
}
export function printModeLog(obj) {
    if (!printModeEnabled) {
        return;
    }
    if (obj.type === 'error') {
        originalConsoleError(JSON.stringify(obj));
    }
    else {
        originalConsoleLog(JSON.stringify(obj));
    }
}
