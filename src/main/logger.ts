export class DesktopLogger {
  public appendLine(message: string): void {
    console.log(`[RepoFlow] ${message}`);
  }
}
