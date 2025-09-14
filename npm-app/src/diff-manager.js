/**
 * Singleton class for managing file changes and diffs throughout the application.
 * Provides centralized functionality for tracking, displaying, and managing file modifications.
 */
export class DiffManager {
    static userInputChanges = [];
    static hookFiles = [];
    static userInputBeginning = false;
    static setChanges(userInputChanges) {
        this.userInputChanges = [...userInputChanges];
    }
    static startUserInput() {
        this.userInputBeginning = true;
    }
    static receivedResponse() {
        if (this.userInputBeginning) {
            this.userInputBeginning = false;
            this.clearAllChanges();
        }
    }
    static addChange(change) {
        if (this.userInputBeginning) {
            this.userInputBeginning = false;
            this.clearAllChanges();
        }
        this.userInputChanges.push(change);
        this.hookFiles.push(change.path);
    }
    static getChanges() {
        return [...this.userInputChanges];
    }
    static getHookFiles() {
        return [...this.hookFiles];
    }
    static clearAllChanges() {
        this.userInputChanges = [];
        this.hookFiles = [];
    }
    static clearHookFiles() {
        this.hookFiles = [];
    }
}
