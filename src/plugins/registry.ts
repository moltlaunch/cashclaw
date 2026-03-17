import type { Plugin } from "./types.js";

const plugins = new Map<string, Plugin>();

export function registerPlugin(plugin: Plugin): void {
  if (plugins.has(plugin.name)) {
    throw new Error(`Plugin "${plugin.name}" is already registered`);
  }
  plugins.set(plugin.name, plugin);
}

export function getPlugin(name: string): Plugin | undefined {
  return plugins.get(name);
}

export function getAllPlugins(): Plugin[] {
  return Array.from(plugins.values());
}

export async function activateAll(): Promise<void> {
  for (const plugin of plugins.values()) {
    await plugin.activate();
  }
}

export async function deactivateAll(): Promise<void> {
  for (const plugin of plugins.values()) {
    await plugin.deactivate();
  }
}

export function clearPlugins(): void {
  plugins.clear();
}
