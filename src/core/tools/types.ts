export interface ToolParam {
  name: string;
  type: string;
  description: string;
  required?: boolean;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParam[];
  requiresConfirmation?: boolean;
  execute(params: Record<string, unknown>): Promise<ToolResult>;
}
