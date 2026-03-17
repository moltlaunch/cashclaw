export interface Plugin {
  name: string;
  version: string;
  description: string;
  activate(): Promise<void>;
  deactivate(): Promise<void>;
}
