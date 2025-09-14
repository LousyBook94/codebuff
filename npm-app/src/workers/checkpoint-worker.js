import { parentPort as maybeParentPort } from 'worker_threads';
import { restoreFileState, storeFileState } from '../checkpoints/file-manager';
import { setProjectRoot } from '../project-files';
if (maybeParentPort) {
    const parentPort = maybeParentPort;
    /**
     * Handle incoming messages from the main thread.
     * Executes git operations for storing or restoring checkpoints.
     */
    parentPort.on('message', async (message) => {
        const { id, type, projectDir, bareRepoPath, commit, message: commitMessage, relativeFilepaths, } = message;
        setProjectRoot(projectDir);
        try {
            let result;
            if (type === 'store') {
                // Store the current state as a git commit
                result = await storeFileState({
                    projectDir,
                    bareRepoPath,
                    message: commitMessage,
                    relativeFilepaths,
                });
            }
            else if (type === 'restore') {
                // Restore files to a previous git commit state
                await restoreFileState({
                    projectDir,
                    bareRepoPath,
                    commit: commit,
                    relativeFilepaths,
                });
                result = true;
            }
            else {
                throw new Error(`Unknown operation type: ${type}`);
            }
            parentPort.postMessage({ id, success: true, result });
        }
        catch (error) {
            // Note: logger is not available in worker threads, so we just send the error back
            parentPort.postMessage({
                id,
                success: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });
}
