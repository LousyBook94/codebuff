import { createTimeoutDetector } from './rage-detector';
export async function withHangDetection(commandName, commandFn) {
    const hangDetector = createTimeoutDetector({
        reason: 'command_hung',
        timeoutMs: 60_000,
    });
    hangDetector.start({ commandName });
    try {
        return await commandFn();
    }
    finally {
        hangDetector.stop();
    }
}
