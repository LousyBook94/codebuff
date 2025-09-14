import assert from 'assert';
import os from 'os';
import { Worker } from 'worker_threads';
import { DEFAULT_MAX_FILES, getAllFilePaths, } from '@codebuff/common/project-file-tree';
import { blue, bold, cyan, gray, red, underline, yellow } from 'picocolors';
import { DiffManager } from '../diff-manager';
import { getProjectRoot } from '../project-files';
import { getBareRepoPath, getLatestCommit, hasUnsavedChanges, } from './file-manager';
import { gitCommandIsAvailable } from '../utils/git';
import { logger } from '../utils/logger';
export class CheckpointsDisabledError extends Error {
    constructor(message, options) {
        super(message, options);
        this.name = 'CheckpointsDisabledError';
    }
}
/**
 * Manages checkpoints of agent state and file state using git operations in a worker thread.
 * Each checkpoint contains both the agent's conversation state and a git commit
 * representing the state of all tracked files at that point.
 */
export class CheckpointManager {
    checkpoints = [];
    currentCheckpointId = 0;
    disabledReason = null;
    bareRepoPath = null;
    /** Stores the undo chain (leaf node first, current node last) */
    undoIds = [];
    /** Worker thread for git operations */
    worker = null;
    /**
     * Initialize or return the existing worker thread
     * @returns The worker thread instance
     */
    initWorker() {
        if (!this.worker) {
            const workerRelativePath = './workers/checkpoint-worker.ts';
            this.worker = new Worker(process.env.IS_BINARY
                ? // Use relative path for compiled binary.
                    workerRelativePath
                : // Use absolute path for dev (via bun URL).
                    new URL(workerRelativePath, import.meta.url).href);
            // Set max listeners to prevent warnings
            this.worker.setMaxListeners(50);
        }
        return this.worker;
    }
    /**
     * Execute an operation in the worker thread with timeout handling
     * @param message - The message describing the operation to perform
     * @returns A promise that resolves with the operation result
     * @throws {Error} if the operation fails or times out
     */
    async runWorkerOperation(message) {
        const worker = this.initWorker();
        return new Promise((resolve, reject) => {
            const timeoutMs = 30000; // 30 seconds timeout
            let timeoutHandle = null;
            const cleanup = () => {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                    timeoutHandle = null;
                }
                worker.off('message', messageHandler);
                worker.off('error', errorHandler);
            };
            const messageHandler = (response) => {
                if (response.id !== message.id) {
                    return;
                }
                cleanup();
                if (response.success) {
                    resolve(response.result);
                }
                else {
                    reject(new Error(response.error));
                }
            };
            const errorHandler = (error) => {
                cleanup();
                reject(error);
            };
            worker.on('message', messageHandler);
            worker.on('error', errorHandler);
            worker.postMessage(message);
            // Add timeout
            timeoutHandle = setTimeout(() => {
                cleanup();
                reject(new Error('Worker operation timed out'));
            }, timeoutMs);
        });
    }
    /**
     * Get the path to the bare git repository used for storing file states
     * @returns The bare repo path
     */
    getBareRepoPath() {
        if (!this.bareRepoPath) {
            this.bareRepoPath = getBareRepoPath(getProjectRoot());
        }
        return this.bareRepoPath;
    }
    /**
     * Add a new checkpoint of the current agent and file state
     * @param sessionState - The current agent state to checkpoint
     * @param lastToolResults - The tool results from the last assistant turn
     * @param userInput - The user input that triggered this checkpoint
     * @returns The latest checkpoint and whether that checkpoint was created (or already existed)
     * @throws {Error} If the checkpoint cannot be added
     */
    async addCheckpoint(sessionState, lastToolResults, userInput, saveWithNoChanges = false) {
        if (this.disabledReason !== null) {
            throw new CheckpointsDisabledError(this.disabledReason);
        }
        if (!gitCommandIsAvailable()) {
            this.disabledReason = 'Git required for checkpoints';
            throw new CheckpointsDisabledError(this.disabledReason);
        }
        const id = this.checkpoints.length + 1;
        const projectDir = getProjectRoot();
        if (projectDir === os.homedir()) {
            this.disabledReason = 'In home directory';
            throw new CheckpointsDisabledError(this.disabledReason);
        }
        const bareRepoPath = this.getBareRepoPath();
        const relativeFilepaths = getAllFilePaths(sessionState.fileContext.fileTree);
        if (relativeFilepaths.length >= DEFAULT_MAX_FILES) {
            this.disabledReason = 'Project too large';
            throw new CheckpointsDisabledError(this.disabledReason);
        }
        const needToStage = saveWithNoChanges ||
            (await hasUnsavedChanges({
                projectDir,
                bareRepoPath,
                relativeFilepaths,
            })) ||
            saveWithNoChanges;
        if (!needToStage && this.checkpoints.length > 0) {
            return {
                checkpoint: this.checkpoints[this.checkpoints.length - 1],
                created: false,
            };
        }
        let fileStateIdPromise;
        if (needToStage) {
            const params = {
                type: 'store',
                projectDir,
                bareRepoPath,
                message: `Checkpoint ${id}`,
                relativeFilepaths,
            };
            fileStateIdPromise = this.runWorkerOperation({
                ...params,
                id: JSON.stringify(params),
            });
        }
        else {
            fileStateIdPromise = getLatestCommit({ bareRepoPath });
        }
        const checkpoint = {
            sessionStateString: JSON.stringify(sessionState),
            lastToolResultsString: JSON.stringify(lastToolResults),
            userInputChangesString: JSON.stringify(DiffManager.getChanges()),
            fileStateIdPromise,
            historyLength: sessionState.mainAgentState.messageHistory.length,
            id,
            parentId: this.currentCheckpointId,
            timestamp: Date.now(),
            userInput,
        };
        this.checkpoints.push(checkpoint);
        this.currentCheckpointId = id;
        this.undoIds = [];
        return { checkpoint, created: true };
    }
    /**
     * Get the most recent checkpoint
     * @returns The most recent checkpoint or null if none exist
     * @throws {CheckpointsDisabledError} If checkpoints are disabled
     * @throws {ReferenceError} If no checkpoints exist
     */
    getLatestCheckpoint() {
        if (this.disabledReason !== null) {
            throw new CheckpointsDisabledError(this.disabledReason);
        }
        if (this.checkpoints.length === 0) {
            throw new ReferenceError('No checkpoints available');
        }
        return this.checkpoints[this.checkpoints.length - 1];
    }
    /**
     * Restore the file state from a specific checkpoint
     * @param id - The ID of the checkpoint to restore
     * @param resetUndoIds - Whether to reset the chain of undo/redo ids
     * @throws {Error} If the file state cannot be restored
     */
    async restoreCheckointFileState({ id, resetUndoIds = false, }) {
        if (this.disabledReason !== null) {
            throw new CheckpointsDisabledError(this.disabledReason);
        }
        const checkpoint = this.checkpoints[id - 1];
        if (!checkpoint) {
            throw new ReferenceError('No checkpoints available');
        }
        const relativeFilepaths = getAllFilePaths(JSON.parse(checkpoint.sessionStateString).fileContext
            .fileTree);
        const params = {
            type: 'restore',
            projectDir: getProjectRoot(),
            bareRepoPath: this.getBareRepoPath(),
            commit: await checkpoint.fileStateIdPromise,
            relativeFilepaths,
        };
        await this.runWorkerOperation({ ...params, id: JSON.stringify(params) });
        this.currentCheckpointId = id;
        if (resetUndoIds) {
            this.undoIds = [];
        }
        DiffManager.setChanges(JSON.parse(checkpoint.userInputChangesString));
    }
    async restoreUndoCheckpoint() {
        if (this.disabledReason !== null) {
            throw new CheckpointsDisabledError(this.disabledReason);
        }
        const currentCheckpoint = this.checkpoints[this.currentCheckpointId - 1];
        assert(currentCheckpoint, `Internal error: checkpoint #${this.currentCheckpointId} not found`);
        if (currentCheckpoint.parentId === 0) {
            throw new ReferenceError('Already at earliest change');
        }
        await this.restoreCheckointFileState({ id: currentCheckpoint.parentId });
        this.undoIds.push(currentCheckpoint.id);
    }
    async restoreRedoCheckpoint() {
        if (this.disabledReason !== null) {
            throw new CheckpointsDisabledError(this.disabledReason);
        }
        const targetId = this.undoIds.pop();
        if (targetId === undefined) {
            throw new ReferenceError('Nothing to redo');
        }
        // Check if targetId is either 0 or undefined
        assert(targetId, `Internal error: Checkpoint ID ${targetId} found in undo list`);
        try {
            await this.restoreCheckointFileState({ id: targetId });
        }
        catch (error) {
            this.undoIds.push(targetId);
            logger.error({
                errorMessage: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined,
                targetId,
            }, 'Unable to restore checkpoint during redo');
            throw new Error('Unable to restore checkpoint', { cause: error });
        }
    }
    /**
     * Clear all checkpoints
     */
    clearCheckpoints(resetBareRepoPath = false) {
        this.checkpoints = [];
        this.currentCheckpointId = 0;
        this.undoIds = [];
        if (resetBareRepoPath) {
            this.bareRepoPath = null;
        }
    }
    /**
     * Get a formatted string representation of all checkpoints
     * @param detailed Whether to include detailed information about each checkpoint
     * @returns A formatted string representation of all checkpoints
     */
    getCheckpointsAsString(detailed = false) {
        if (this.disabledReason !== null) {
            return red(`Checkpoints not enabled: ${this.disabledReason}`);
        }
        if (this.checkpoints.length === 0) {
            return yellow('No checkpoints available.');
        }
        const lines = [bold(underline('Agent State Checkpoints:')), ''];
        this.checkpoints.forEach((checkpoint) => {
            const date = new Date(checkpoint.timestamp);
            const formattedDate = date.toLocaleString();
            const userInputOneLine = checkpoint.userInput.replaceAll('\n', ' ');
            const userInput = userInputOneLine.length > 50
                ? userInputOneLine.substring(0, 47) + '...'
                : userInputOneLine;
            lines.push(`${cyan(bold(`#${checkpoint.id}`))} ${gray(`[${formattedDate}]`)}:`);
            lines.push(`  ${blue('Input')}: ${userInput}`);
            if (detailed) {
                const messageCount = checkpoint.historyLength;
                lines.push(`  ${blue('Messages')}: ${messageCount}`);
            }
            lines.push(''); // Empty line between checkpoints
        });
        return lines.join('\n');
    }
}
// Export a singleton instance for use throughout the application
export const checkpointManager = new CheckpointManager();
