/** Dev-only sandbox for the tutorial module: open the game with ?sandbox=tutorial. */
export async function runSandbox(root: HTMLElement): Promise<void> {
  root.textContent = 'tutorial sandbox (empty)';
}
