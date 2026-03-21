export function escapeShellArg(arg: string): string {
  if (!arg) return '""';

  // Check if the argument contains any special characters
  const hasSpecialChars = /[^\w@%+=:,./-]/.test(arg);

  if (!hasSpecialChars) {
    return arg;
  }

  // Escape single quotes by ending the quoted string, adding an escaped quote, and starting a new quoted string
  return "'" + arg.replace(/'/g, "'\"'\"'") + "'";
}

export function escapeShellArgs(args: string[]): string[] {
  return args.map(escapeShellArg);
}

export function buildShellCommand(command: string, args: string[]): string {
  const escapedArgs = escapeShellArgs(args);
  return [command, ...escapedArgs].join(' ');
}

export function sanitizeInput(input: string): string {
  // Remove null bytes and other control characters
  return input.replace(/[\x00-\x1F\x7F]/g, '');
}

export function parseCommaSeparatedList(input: string): string[] {
  if (!input.trim()) return [];

  return input
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0)
    .map(sanitizeInput);
}

export function formatSkillsForShell(skills: string): string {
  const skillList = parseCommaSeparatedList(skills);
  return skillList.join(',');
}
