import { bold, cyan, green, red, underline } from 'picocolors';
import { CheckpointsDisabledError, checkpointManager, } from '../checkpoints/checkpoint-manager';
import { logger } from '../utils/logger';
import { Spinner } from '../utils/spinner';
export const checkpointCommands = {
    save: [['checkpoint'], 'Save current state as a new checkpoint'],
    list: [['checkpoint list', 'checkpoints'], 'List all saved checkpoints'],
    clear: [['checkpoint clear'], 'Clear all checkpoints'],
    undo: [['undo', 'u'], 'Undo to previous checkpoint'],
    redo: [['redo', 'r'], 'Redo previously undone checkpoint'],
    restore: [[/^checkpoint\s+(\d+)$/], 'Restore to checkpoint number <n>'],
};
const allCheckpointCommands = Object.entries(checkpointCommands)
    .map((entry) => entry[1][0])
    .flat();
export function displayCheckpointMenu() {
    console.log('\n' + bold(underline('Checkpoint Commands:')));
    Object.entries(checkpointCommands).forEach(([, [aliases, description]]) => {
        const formattedAliases = aliases
            .map((a) => (typeof a === 'string' ? cyan(a) : cyan('checkpoint <n>')))
            .join(', ');
        console.log(`${formattedAliases} - ${description}`);
    });
    console.log();
}
export function isCheckpointCommand(userInput, type = null) {
    if (type === null) {
        if (userInput.startsWith('checkpoint')) {
            return true;
        }
        for (const pattern of allCheckpointCommands) {
            if (pattern instanceof RegExp) {
                const m = userInput.match(pattern);
                if (m) {
                    return m;
                }
            }
            if (userInput === pattern) {
                return true;
            }
        }
        return false;
    }
    for (const pattern of checkpointCommands[type][0]) {
        if (pattern instanceof RegExp) {
            const m = userInput.match(pattern);
            if (m) {
                return m;
            }
        }
        if (userInput === pattern) {
            return true;
        }
    }
    return false;
}
export async function listCheckpoints() {
    console.log(checkpointManager.getCheckpointsAsString());
}
export async function handleUndo(client, rl) {
    let failed = false;
    try {
        await checkpointManager.restoreUndoCheckpoint();
    }
    catch (error) {
        failed = true;
        if (error instanceof CheckpointsDisabledError) {
            console.log(red(`Checkpoints not enabled: ${error.message}`));
        }
        else {
            console.log(red(`Unable to undo: ${error.message}`));
            logger.error({
                errorMessage: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined,
            }, 'Failed to restore undo checkpoint');
        }
    }
    let userInput = '';
    if (!failed) {
        const currentCheckpoint = checkpointManager.checkpoints[checkpointManager.currentCheckpointId - 1];
        // Restore the sessionState
        client.sessionState = JSON.parse(currentCheckpoint.sessionStateString);
        client.lastToolResults = JSON.parse(currentCheckpoint.lastToolResultsString);
        console.log(green(`Checkpoint #${checkpointManager.currentCheckpointId} restored.`));
        userInput =
            checkpointManager.checkpoints[checkpointManager.currentCheckpointId - 1]
                ?.userInput ?? '';
    }
    return isCheckpointCommand(userInput) ? '' : userInput;
}
export async function handleRedo(client, rl) {
    let failed = false;
    try {
        await checkpointManager.restoreRedoCheckpoint();
    }
    catch (error) {
        failed = true;
        if (error instanceof CheckpointsDisabledError) {
            console.log(red(`Checkpoints not enabled: ${error.message}`));
        }
        else {
            console.log(red(`Unable to redo: ${error.message}`));
            logger.error({
                errorMessage: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined,
            }, 'Failed to restore redo checkpoint');
        }
    }
    let userInput = '';
    if (!failed) {
        const currentCheckpoint = checkpointManager.checkpoints[checkpointManager.currentCheckpointId - 1];
        // Restore the sessionState
        client.sessionState = JSON.parse(currentCheckpoint.sessionStateString);
        client.lastToolResults = JSON.parse(currentCheckpoint.lastToolResultsString);
        console.log(green(`Checkpoint #${checkpointManager.currentCheckpointId} restored.`));
        userInput =
            checkpointManager.checkpoints[checkpointManager.currentCheckpointId - 1]
                ?.userInput ?? '';
    }
    return isCheckpointCommand(userInput) ? '' : userInput;
}
export async function handleRestoreCheckpoint(id, client, rl) {
    Spinner.get().start('Restoring...');
    if (checkpointManager.disabledReason !== null) {
        console.log(red(`Checkpoints not enabled: ${checkpointManager.disabledReason}`));
        return '';
    }
    const checkpoint = checkpointManager.checkpoints[id - 1];
    if (!checkpoint) {
        console.log(red(`Checkpoint #${id} not found.`));
        return '';
    }
    try {
        // Wait for save before trying to restore checkpoint
        const latestCheckpoint = checkpointManager.getLatestCheckpoint();
        await latestCheckpoint?.fileStateIdPromise;
    }
    catch (error) {
        // Should never happen
        logger.error({
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
        }, 'Failed to wait for latest checkpoint file state');
    }
    // Restore the sessionState
    client.sessionState = JSON.parse(checkpoint.sessionStateString);
    client.lastToolResults = JSON.parse(checkpoint.lastToolResultsString);
    let failed = false;
    try {
        // Restore file state
        await checkpointManager.restoreCheckointFileState({
            id: checkpoint.id,
            resetUndoIds: true,
        });
    }
    catch (error) {
        failed = true;
        Spinner.get().stop();
        console.log(red(`Unable to restore checkpoint: ${error.message}`));
        logger.error({
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
        }, 'Failed to restore checkpoint file state');
    }
    if (!failed) {
        Spinner.get().stop();
        console.log(green(`Restored to checkpoint #${id}.`));
    }
    // Insert the original user input that created this checkpoint
    return isCheckpointCommand(checkpoint.userInput) ? '' : checkpoint.userInput;
}
export function handleClearCheckpoints() {
    checkpointManager.clearCheckpoints();
    console.log('Cleared all checkpoints.');
}
export async function waitForPreviousCheckpoint() {
    try {
        // Make sure the previous checkpoint is done
        await checkpointManager.getLatestCheckpoint().fileStateIdPromise;
    }
    catch (error) {
        // No latest checkpoint available, previous checkpoint is guaranteed to be done.
    }
}
export async function saveCheckpoint(userInput, client, readyPromise, saveWithNoChanges = false) {
    if (checkpointManager.disabledReason !== null) {
        return;
    }
    Spinner.get().start('Loading Files...');
    await readyPromise;
    Spinner.get().stop();
    Spinner.get().start('Saving...');
    await waitForPreviousCheckpoint();
    Spinner.get().stop();
    // Save the current agent state
    try {
        const { checkpoint, created } = await checkpointManager.addCheckpoint(client.sessionState, client.lastToolResults, userInput, saveWithNoChanges);
        if (created) {
            console.log(`[checkpoint #${checkpoint.id} saved]`);
        }
    }
    catch (error) {
        // Unable to add checkpoint, do not display anything to user
        logger.error({
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
        }, 'Failed to add checkpoint');
    }
}
