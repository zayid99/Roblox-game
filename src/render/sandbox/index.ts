/** Dev-only sandbox for the render module: open the game with ?sandbox=render. */
export async function runSandbox(root: HTMLElement): Promise<void> {
  root.textContent = 'render sandbox (empty)';
}
