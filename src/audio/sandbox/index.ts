/** Dev-only sandbox for the audio module: open the game with ?sandbox=audio. */
export async function runSandbox(root: HTMLElement): Promise<void> {
  root.textContent = 'audio sandbox (empty)';
}
