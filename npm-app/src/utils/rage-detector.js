import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events';
import { trackEvent } from './analytics';
// Factory function for COUNT-based detectors
export function createCountDetector(options) {
    let history = [];
    let debounceTimer = null;
    const recordEvent = (value) => {
        // Apply filter if provided
        if (options.filter && !options.filter(value)) {
            return; // Skip this event
        }
        const now = Date.now();
        history.push({ timestamp: now, value });
        // Trim history to prevent memory leaks
        if (history.length > options.historyLimit) {
            history.shift();
        }
        checkForRage();
    };
    const checkForRage = () => {
        const now = Date.now();
        const recentEvents = history.filter((event) => now - event.timestamp <= options.timeWindow);
        if (recentEvents.length < options.threshold) {
            return;
        }
        // Check for consecutive repeats of the same value
        let repeatCount = 1;
        let lastValue = null;
        let repeatedEvents = [];
        for (const event of recentEvents) {
            // Custom comparison for objects (like key events)
            const isSameValue = typeof event.value === 'object' && typeof lastValue === 'object'
                ? JSON.stringify(event.value) === JSON.stringify(lastValue)
                : event.value === lastValue;
            if (isSameValue) {
                repeatCount++;
                repeatedEvents.push(event);
            }
            else {
                repeatCount = 1;
                repeatedEvents = [event];
            }
            if (repeatCount >= options.threshold) {
                fireEvent(repeatedEvents);
                return;
            }
            lastValue = event.value;
        }
    };
    const fireEvent = (events) => {
        if (debounceTimer)
            return; // Debounce active
        trackEvent(AnalyticsEvent.RAGE, {
            reason: options.reason,
            count: events.length,
            timeWindow: options.timeWindow,
            repeatedKey: events[0]?.value,
        });
        history = []; // Clear history to prevent immediate re-firing
        if (options.debounceMs) {
            debounceTimer = setTimeout(() => {
                debounceTimer = null;
            }, options.debounceMs);
        }
    };
    return { recordEvent };
}
// Factory function for TIME_BETWEEN-based detectors
export function createTimeBetweenDetector(options) {
    let startEvent = null;
    let coolDownTimer = null;
    const start = () => {
        startEvent = { timestamp: Date.now(), value: null };
    };
    const end = () => {
        if (!startEvent || coolDownTimer)
            return;
        const duration = Date.now() - startEvent.timestamp;
        const operator = options.operator || 'lt'; // Default to lt for backward compatibility
        let shouldFire = false;
        switch (operator) {
            case 'lt':
                shouldFire = duration < options.threshold;
                break;
            case 'gt':
                shouldFire = duration > options.threshold;
                break;
            case 'eq':
                shouldFire = duration === options.threshold;
                break;
            case 'gte':
                shouldFire = duration >= options.threshold;
                break;
            case 'lte':
                shouldFire = duration <= options.threshold;
                break;
        }
        if (shouldFire) {
            fireEvent(duration);
        }
        startEvent = null;
    };
    const fireEvent = (duration) => {
        trackEvent(AnalyticsEvent.RAGE, {
            reason: options.reason,
            duration,
            threshold: options.threshold,
            operator: options.operator,
        });
        if (options.debounceMs) {
            coolDownTimer = setTimeout(() => {
                coolDownTimer = null;
            }, options.debounceMs);
        }
    };
    return { start, end };
}
// Factory function for TIMEOUT-based detectors
export function createTimeoutDetector(options) {
    let timeoutHandle = null;
    const start = (context) => {
        stop(); // Clear any existing timeout
        const startTime = Date.now();
        timeoutHandle = setTimeout(async () => {
            if (options.shouldFire && !(await options.shouldFire(context))) {
                return;
            }
            const duration = Date.now() - startTime;
            trackEvent(AnalyticsEvent.RAGE, {
                reason: options.reason,
                durationMs: duration,
                timeoutMs: options.timeoutMs,
                ...options.context,
                ...context,
            });
            if (options.onHang) {
                options.onHang();
            }
        }, options.timeoutMs);
    };
    const stop = () => {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
            timeoutHandle = null;
        }
    };
    return { start, stop };
}
