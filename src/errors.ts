/**
 * Application-level error carrying an HTTP status and a user-facing (Chinese)
 * message. db/route layers throw these; the top-level `onError` handler reads
 * `status`/`userMessage` directly instead of matching on message strings.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly userMessage: string,
  ) {
    super(userMessage);
    this.name = "AppError";
  }
}

export const invalidId = () => new AppError(400, "无效的 ID");
export const invalidSlug = () => new AppError(400, "无效的白板标识");
