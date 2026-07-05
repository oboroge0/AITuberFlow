/**
 * Node context for AITuberFlow Plugin SDK.
 *
 * Provides execution context to nodes including event emission,
 * logging, character state, and background task management.
 */

/**
 * Represents an event in the AITuberFlow event system.
 */
export interface Event {
  type: string;
  payload: Record<string, any>;
  sourceNodeId?: string;
  timestamp: string;
}

/**
 * Create an Event with a default timestamp.
 */
export function createEvent(
  type: string,
  payload: Record<string, any>,
  sourceNodeId?: string,
): Event {
  return {
    type,
    payload,
    sourceNodeId,
    timestamp: new Date().toISOString(),
  };
}

type EmitCallback = (event: Event) => Promise<void>;
type LogCallback = (message: string, level: string) => Promise<void>;
type UpdateCharacterCallback = (updates: Record<string, any>) => Promise<void>;

/**
 * A single stored memory row as returned by memory search operations.
 */
export interface MemoryRecord {
  id: string;
  content: string;
  createdAt: string;
}

/** Options accepted by {@link NodeContext.searchMemories}. */
export interface SearchMemoriesOptions {
  searchType: "recent" | "keyword";
  query?: string;
  limit?: number;
}

type SaveMemoryCallback = (tableName: string, content: string) => Promise<string>;
type SearchMemoriesCallback = (
  tableName: string,
  options: SearchMemoriesOptions,
) => Promise<MemoryRecord[]>;

export interface NodeContextOptions {
  workflowId: string;
  nodeId: string;
  character: Record<string, any>;
  emitCallback?: EmitCallback;
  logCallback?: LogCallback;
  updateCharacterCallback?: UpdateCharacterCallback;
  saveMemoryCallback?: SaveMemoryCallback;
  searchMemoriesCallback?: SearchMemoriesCallback;
}

/**
 * Context passed to node execution.
 *
 * Provides access to workflow state, event emission, logging,
 * and background task management via AbortController.
 */
export class NodeContext {
  readonly workflowId: string;
  readonly nodeId: string;
  character: Record<string, any>;

  private _emitCallback?: EmitCallback;
  private _logCallback?: LogCallback;
  private _updateCharacterCallback?: UpdateCharacterCallback;
  private _saveMemoryCallback?: SaveMemoryCallback;
  private _searchMemoriesCallback?: SearchMemoriesCallback;
  private _abortControllers: Set<AbortController> = new Set();

  constructor(options: NodeContextOptions) {
    this.workflowId = options.workflowId;
    this.nodeId = options.nodeId;
    this.character = options.character;
    this._emitCallback = options.emitCallback;
    this._logCallback = options.logCallback;
    this._updateCharacterCallback = options.updateCharacterCallback;
    this._saveMemoryCallback = options.saveMemoryCallback;
    this._searchMemoriesCallback = options.searchMemoriesCallback;
  }

  /**
   * Emit an event to the event bus.
   *
   * Accepts either an Event object or a plain object with a `type` key.
   */
  async emitEvent(event: Event | Record<string, any>): Promise<void> {
    if (!this._emitCallback) return;

    let resolved: Event;
    if ("type" in event && "payload" in event && "timestamp" in event) {
      resolved = event as Event;
    } else {
      const { type, sourceNodeId, timestamp, ...rest } = event as Record<string, any>;
      resolved = {
        type: (type as string) ?? "unknown",
        payload: rest,
        sourceNodeId: sourceNodeId as string | undefined,
        timestamp: (timestamp as string) ?? new Date().toISOString(),
      };
    }

    resolved.sourceNodeId = this.nodeId;
    await this._emitCallback(resolved);
  }

  /**
   * Send a log message to the frontend.
   */
  async log(message: string, level: string = "info"): Promise<void> {
    if (this._logCallback) {
      await this._logCallback(message, level);
    }
  }

  /**
   * Update the character state.
   */
  async updateCharacter(updates: Record<string, any>): Promise<void> {
    if (this._updateCharacterCallback) {
      await this._updateCharacterCallback(updates);
    }
    for (const [key, value] of Object.entries(updates)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      this.character[key] = value;
    }
  }

  /**
   * Get the character's name.
   */
  getCharacterName(): string {
    return (this.character["name"] as string) ?? "AI Assistant";
  }

  /**
   * Get the character's personality.
   */
  getCharacterPersonality(): string {
    return (this.character["personality"] as string) ?? "";
  }

  /**
   * Get the character's current emotion.
   */
  getEmotion(): Record<string, any> {
    return (this.character["emotion"] as Record<string, any>) ?? {
      current: "neutral",
      intensity: 0.5,
    };
  }

  /**
   * Save a piece of text to the workflow's long-term memory store.
   *
   * @param tableName Logical table/collection to save the memory under.
   * @param content Text content to persist.
   * @returns The generated id of the saved memory.
   * @throws {Error} If no save callback has been configured for this context.
   */
  async saveMemory(tableName: string, content: string): Promise<string> {
    if (!this._saveMemoryCallback) {
      throw new Error("saveMemory is not available in this context");
    }
    return await this._saveMemoryCallback(tableName, content);
  }

  /**
   * Search the workflow's long-term memory store.
   *
   * @param tableName Logical table/collection to search within.
   * @param options Search parameters (recent vs. keyword, limit).
   * @returns Matching memories, most recent first.
   * @throws {Error} If no search callback has been configured for this context.
   */
  async searchMemories(
    tableName: string,
    options: SearchMemoriesOptions,
  ): Promise<MemoryRecord[]> {
    if (!this._searchMemoriesCallback) {
      throw new Error("searchMemories is not available in this context");
    }
    return await this._searchMemoriesCallback(tableName, options);
  }

  /**
   * Create a background task tracked by this context.
   *
   * Uses AbortController for cancellation (TypeScript equivalent
   * of Python's asyncio.create_task). The task receives an AbortSignal
   * it should check for cancellation.
   *
   * @returns The AbortController for the created task
   */
  createTask(fn: (signal: AbortSignal) => Promise<void>): AbortController {
    const controller = new AbortController();
    this._abortControllers.add(controller);

    fn(controller.signal)
      .catch(() => {
        // Task completed or was aborted — either way, clean up
      })
      .finally(() => {
        this._abortControllers.delete(controller);
      });

    return controller;
  }

  /**
   * Cancel all background tasks created by this context.
   */
  async cancelBackgroundTasks(): Promise<void> {
    for (const controller of this._abortControllers) {
      controller.abort();
    }
    this._abortControllers.clear();
  }
}
