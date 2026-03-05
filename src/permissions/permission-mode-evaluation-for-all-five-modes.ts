import type { PermissionMode } from '../types/permissions.js';

/**
 * File operation tools (read/write/edit)
 */
const FILE_TOOLS = new Set([
  'read_file',
  'write_file',
  'edit_file',
  'read_multiple_files',
  'directory_tree',
  'list_directory_contents',
  'search_files',
  'create_directory',
  'move_file',
  'delete_file',
  'copy_file',
  'workspace_tools',
]);

/**
 * Read-only tools
 */
const READ_ONLY_TOOLS = new Set([
  'read_file',
  'read_multiple_files',
  'directory_tree',
  'list_directory_contents',
  'search_files',
  'glob',
  'grep',
]);

/**
 * Bash execution tool
 */
const BASH_TOOL = 'bash';

/**
 * Network tools
 */
const NETWORK_TOOLS = new Set([
  'web_fetch',
  'request',
  'http_request',
]);

/**
 * Permission mode evaluation result
 */
type PermissionDecision = 'allow' | 'deny' | 'ask';

/**
 * Evaluate permission mode for a tool
 * @param mode - Permission mode
 * @param toolName - Name of the tool being executed
 * @returns Permission decision
 */
export function evaluatePermissionMode(
  mode: PermissionMode | 'auto',
  toolName: string
): PermissionDecision {
  switch (mode) {
    case 'bypassPermissions':
    case 'auto': // 'auto' is an alias for bypassPermissions (allow all)
      return evaluateBypassPermissions(toolName);

    case 'plan':
      return evaluatePlanMode(toolName);

    case 'acceptEdits':
      return evaluateAcceptEditsMode(toolName);

    case 'dontAsk':
      return evaluateDontAskMode(toolName);

    case 'never':
      return 'deny'; // Never allow anything

    case 'default':
    default:
      return evaluateDefaultMode(toolName);
  }
}

/**
 * bypassPermissions mode: Always allow everything
 */
function evaluateBypassPermissions(_toolName: string): PermissionDecision {
  return 'allow';
}

/**
 * plan mode: Read-only mode, deny write operations
 * - Allow: Read, Glob, Grep, and other read-only tools
 * - Deny: Write, Edit, Bash, and any modifying operations
 */
function evaluatePlanMode(toolName: string): PermissionDecision {
  const normalizedTool = toolName.toLowerCase();

  if (READ_ONLY_TOOLS.has(normalizedTool)) {
    return 'allow';
  }

  // Check if it's a read-only variant (e.g., with namespace prefix)
  if (normalizedTool.includes('read') ||
      normalizedTool.includes('list') ||
      normalizedTool.includes('search') ||
      normalizedTool.includes('glob') ||
      normalizedTool.includes('grep')) {
    return 'allow';
  }

  // Deny all other tools (write, edit, bash, etc.)
  return 'deny';
}

/**
 * acceptEdits mode: Allow file operations, ask for others
 * - Allow: All file tools (Read, Write, Edit, etc.)
 * - Ask: Bash, WebFetch, and network tools
 * - Ask: Everything else (delegate to canUseTool)
 */
function evaluateAcceptEditsMode(toolName: string): PermissionDecision {
  const normalizedTool = toolName.toLowerCase();

  // Allow all file operations
  if (FILE_TOOLS.has(normalizedTool)) {
    return 'allow';
  }

  // Check if it's a file operation variant
  if (normalizedTool.includes('file') ||
      normalizedTool.includes('directory') ||
      normalizedTool.includes('create') ||
      normalizedTool.includes('move') ||
      normalizedTool.includes('copy') ||
      normalizedTool.includes('delete') ||
      normalizedTool.includes('workspace')) {
    return 'allow';
  }

  // Ask for bash and network tools
  if (BASH_TOOL === normalizedTool ||
      NETWORK_TOOLS.has(normalizedTool) ||
      normalizedTool.includes('bash') ||
      normalizedTool.includes('web') ||
      normalizedTool.includes('http') ||
      normalizedTool.includes('fetch') ||
      normalizedTool.includes('request')) {
    return 'ask';
  }

  // Ask for everything else
  return 'ask';
}

/**
 * dontAsk mode: Only allow if pre-approved, otherwise deny
 * - Allow: Only tools that have been explicitly pre-approved
 * - Deny: Everything else
 *
 * Note: The actual pre-approval check happens at a higher level
 * (via allowedTools/disallowedTools lists). This function just
 * indicates that no asking should occur.
 */
function evaluateDontAskMode(_toolName: string): PermissionDecision {
  // The actual allow/deny decision is made by checking
  // allowedTools/disallowedTools lists before calling this function.
  // If we reach here, the tool wasn't explicitly allowed, so deny.
  return 'deny';
}

/**
 * default mode: Allow safe tools, ask for unsafe tools
 * - Allow: Read-only tools (read, glob, grep, etc.)
 * - Ask: Bash, write, edit, and other modifying tools
 */
function evaluateDefaultMode(toolName: string): PermissionDecision {
  const normalizedTool = toolName.toLowerCase();

  // Allow read-only tools
  if (READ_ONLY_TOOLS.has(normalizedTool)) {
    return 'allow';
  }

  // Check if it's a read-only variant
  if (normalizedTool.includes('read') ||
      normalizedTool.includes('list') ||
      normalizedTool.includes('search') ||
      normalizedTool.includes('glob') ||
      normalizedTool.includes('grep')) {
    return 'allow';
  }

  // Ask for everything else (bash, write, edit, etc.)
  return 'ask';
}

/**
 * Check if a tool is a file operation tool
 */
export function isFileTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase();
  return FILE_TOOLS.has(normalized) ||
         normalized.includes('file') ||
         normalized.includes('directory') ||
         normalized.includes('workspace');
}

/**
 * Check if a tool is read-only
 */
export function isReadOnlyTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase();
  return READ_ONLY_TOOLS.has(normalized) ||
         normalized.includes('read') ||
         normalized.includes('list') ||
         normalized.includes('search') ||
         normalized.includes('glob') ||
         normalized.includes('grep');
}

/**
 * Check if a tool is a bash/execution tool
 */
export function isBashTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase();
  return BASH_TOOL === normalized || normalized.includes('bash') || normalized.includes('exec');
}

/**
 * Check if a tool is a network tool
 */
export function isNetworkTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase();
  return NETWORK_TOOLS.has(normalized) ||
         normalized.includes('web') ||
         normalized.includes('http') ||
         normalized.includes('fetch') ||
         normalized.includes('request');
}
