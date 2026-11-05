/** Dev-only sandbox for the ui module: open the game with ?sandbox=ui. */
export async function runSandbox(root: HTMLElement): Promise<void> {
  root.textContent = 'ui sandbox (empty)';
}
