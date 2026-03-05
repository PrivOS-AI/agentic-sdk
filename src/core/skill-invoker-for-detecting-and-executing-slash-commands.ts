import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { SkillLoader } from './skill-loader-for-discovering-and-loading-skills-from-disk.js';

/**
 * Get default skill directories (same as SkillLoader)
 */
const getDefaultSkillDirs = (cwd?: string): string[] => {
  const workingDir = cwd || process.cwd();
  return [
    path.join(workingDir, '.claude', 'skills'),           // 1. Project .claude/skills (highest priority)
    path.join(workingDir, '.claude'),                     // 2. Project .claude/* (searches subdirectories)
    path.join(process.env.HOME || '~', '.claude', 'skills'),  // 3. Global skills (lowest priority)
  ];
};

/**
 * Skill invoker for detecting and executing slash commands
 */
export class SkillInvoker {
  private skillLoader: SkillLoader;
  private skillDirs: string[];

  constructor(skillLoader?: SkillLoader, cwd?: string) {
    this.skillLoader = skillLoader || new SkillLoader(undefined, cwd);
    this.skillDirs = skillLoader ? this.skillLoader['skillDirs'] : getDefaultSkillDirs(cwd);
  }

  /**
   * Detect if a message contains a slash command
   */
  detectSlashCommand(message: string): { command: string; args: string } | null {
    const slashCommandMatch = message.match(/^\/([a-z0-9-]+)\s*(.*)$/i);
    if (!slashCommandMatch) {
      return null;
    }

    const [, command, args] = slashCommandMatch;
    return { command, args: args.trim() };
  }

  /**
   * Load skill content including references and scripts
   */
  private async loadSkillWithReferences(skillName: string): Promise<string | null> {
    // First, load the main SKILL.md
    const skillContent = await this.skillLoader.loadSkillContent(skillName);
    if (!skillContent) {
      return null;
    }

    // Extract instructions (remove frontmatter)
    const instructions = skillContent.replace(/^---\n[\s\S]*?\n---\n/, '');

    // Look for references folder
    let referencesContent = '';
    for (const skillDir of this.skillDirs) {
      const referencesPath = path.join(skillDir, skillName, 'references');
      if (existsSync(referencesPath)) {
        try {
          const files = await fs.readdir(referencesPath);
          const mdFiles = files.filter(f => f.endsWith('.md')).sort();

          for (const file of mdFiles) {
            const filePath = path.join(referencesPath, file);
            const content = await fs.readFile(filePath, 'utf-8');
            referencesContent += `\n\n## Reference: ${file}\n\n${content}`;
          }
        } catch (error) {
          // Skip if can't read references
        }
        break; // Found references, stop looking
      }
    }

    // Look for scripts folder
    let scriptsContent = '';
    for (const skillDir of this.skillDirs) {
      const scriptsPath = path.join(skillDir, skillName, 'scripts');
      if (existsSync(scriptsPath)) {
        try {
          const files = await fs.readdir(scriptsPath);
          // Sort files: shell scripts first, then markdown files
          const sortedFiles = files.sort((a, b) => {
            const aIsSh = a.endsWith('.sh');
            const bIsSh = b.endsWith('.sh');
            if (aIsSh && !bIsSh) return -1;
            if (!aIsSh && bIsSh) return 1;
            return a.localeCompare(b);
          });

          for (const file of sortedFiles) {
            const filePath = path.join(scriptsPath, file);
            const content = await fs.readFile(filePath, 'utf-8');

            if (file.endsWith('.sh')) {
              // For shell scripts, include the full script
              scriptsContent += `\n\n## Script: ${file}\n\n\`\`\`bash\n${content}\n\`\`\``;
            } else {
              // For other files (like .test.md), include as text
              scriptsContent += `\n\n## Script Reference: ${file}\n\n${content}`;
            }
          }
        } catch (error) {
          // Skip if can't read scripts
        }
        break; // Found scripts, stop looking
      }
    }

    // Combine instructions, references, and scripts
    return instructions + referencesContent + scriptsContent;
  }

  /**
   * Process a message and transform slash commands into skill instructions
   * Returns the transformed message or null if no command found
   */
  async processMessage(message: string): Promise<{ message: string; skillName?: string } | null> {
    const commandMatch = this.detectSlashCommand(message);

    if (!commandMatch) {
      return null;
    }

    const { command, args } = commandMatch;

    // Load the skill content with references
    const skillContent = await this.loadSkillWithReferences(command);

    if (!skillContent) {
      // Skill not found, return original message
      return {
        message: `[Error: Skill "${command}" not found. Available skills: /${(await this.skillLoader.getSlashCommands()).map(c => c.name).join(', /')}]\n\n${message}`,
      };
    }

    // Transform the command into a prompt that includes the skill instructions
    const transformedMessage = this.formatSkillPrompt(command, args, skillContent);

    return {
      message: transformedMessage,
      skillName: command,
    };
  }

  /**
   * Format a skill invocation prompt
   */
  private formatSkillPrompt(skillName: string, args: string, skillContent: string): string {
    return `<skill_instructions>
You are executing the /${skillName} skill with arguments: "${args}"

SKILL CONTENT:
${skillContent}

IMPORTANT: Follow the skill instructions above to process the user's request. The skill instructions contain the exact steps you should take.
</skill_instructions>

User request: ${args}`;
  }

  /**
   * Check if a message contains a skill-related request (without slash)
   * This allows natural language skill invocation
   */
  async detectSkillIntent(message: string): Promise<{ skillName: string; confidence: number } | null> {
    const skills = await this.skillLoader.getSlashCommands();
    const lowerMessage = message.toLowerCase();

    for (const skill of skills) {
      // Check if skill name or description matches
      if (lowerMessage.includes(skill.name.replace(/-/g, ' '))) {
        return { skillName: skill.name, confidence: 0.8 };
      }

      // Check description keywords
      const keywords = skill.description.toLowerCase().split(/\s+/);
      const matchCount = keywords.filter((kw) => lowerMessage.includes(kw) && kw.length > 3).length;

      if (matchCount >= 2) {
        return { skillName: skill.name, confidence: 0.6 };
      }
    }

    return null;
  }
}

/**
 * Create a skill invoker instance
 */
export function createSkillInvoker(skillLoader?: SkillLoader, cwd?: string): SkillInvoker {
  return new SkillInvoker(skillLoader, cwd);
}
