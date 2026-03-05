import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import type { SlashCommand, SkillMetadata } from '../types/options.js';

/**
 * Default skill directories to search (in priority order)
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
 * Skill loader for discovering and loading skills from disk
 */
export class SkillLoader {
  private skillDirs: string[];
  private skillCache: Map<string, SkillMetadata> = new Map();

  constructor(skillDirs?: string[], cwd?: string) {
    this.skillDirs = skillDirs || getDefaultSkillDirs(cwd);
  }

  /**
   * Discover all available skills
   */
  async discoverSkills(): Promise<SkillMetadata[]> {
    const skills: SkillMetadata[] = [];
    const seenSkills = new Set<string>(); // Track skill names to prevent duplicates

    for (const skillDir of this.skillDirs) {
      try {
        if (!existsSync(skillDir)) {
          continue;
        }

        const entries = await fs.readdir(skillDir, { withFileTypes: true });

        for (const entry of entries) {
          // If it's a directory directly containing SKILL.md
          if (entry.isDirectory()) {
            const skillPath = path.join(skillDir, entry.name);
            const skillMdPath = path.join(skillPath, 'SKILL.md');

            if (existsSync(skillMdPath)) {
              const metadata = await this.parseSkillMetadata(entry.name, skillMdPath);
              if (metadata && !seenSkills.has(metadata.name)) {
                skills.push(metadata);
                this.skillCache.set(metadata.name, metadata);
                seenSkills.add(metadata.name);
              }
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be read
        console.warn(`[SkillLoader] Failed to read skill directory: ${skillDir}`);
      }
    }

    return skills;
  }

  /**
   * Get skill metadata by name
   */
  getSkill(name: string): SkillMetadata | undefined {
    return this.skillCache.get(name);
  }

  /**
   * Get all skills as slash commands
   */
  async getSlashCommands(): Promise<SlashCommand[]> {
    const skills = await this.discoverSkills();

    return skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      argumentHint: this.inferArgumentHint(skill),
    }));
  }

  /**
   * Load skill content as markdown
   */
  async loadSkillContent(name: string): Promise<string | null> {
    for (const skillDir of this.skillDirs) {
      const skillPath = path.join(skillDir, name, 'SKILL.md');

      try {
        if (existsSync(skillPath)) {
          return await fs.readFile(skillPath, 'utf-8');
        }
      } catch (error) {
        // Continue to next directory
      }
    }

    return null;
  }

  /**
   * Parse skill metadata from SKILL.md file
   */
  private async parseSkillMetadata(
    skillName: string,
    skillMdPath: string
  ): Promise<SkillMetadata | null> {
    try {
      const content = await fs.readFile(skillMdPath, 'utf-8');

      // Extract YAML frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

      if (!frontmatterMatch) {
        console.warn(`[SkillLoader] No frontmatter found in ${skillMdPath}`);
        return null;
      }

      const frontmatter = frontmatterMatch[1];
      const metadata: SkillMetadata = {
        name: skillName,
        description: '',
      };

      // Parse YAML properties
      const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
      const descriptionMatch = frontmatter.match(/^description:\s*(.+)$/m);
      const licenseMatch = frontmatter.match(/^license:\s*(.+)$/m);
      const allowedToolsMatch = frontmatter.match(/^allowed-tools:\s*\n((?:  - .+\n?)+)/m);
      const metadataMatch = frontmatter.match(/^metadata:\s*\n((?:  .+:\s*.+\n?)+)/m);

      if (nameMatch) {
        metadata.name = nameMatch[1].trim();
      }

      if (descriptionMatch) {
        metadata.description = descriptionMatch[1].trim();
      }

      if (licenseMatch) {
        metadata.license = licenseMatch[1].trim();
      }

      if (allowedToolsMatch) {
        metadata.allowedTools = allowedToolsMatch[1]
          .split('\n')
          .map((line) => line.replace(/^\s*-\s*/, '').trim())
          .filter((line) => line.length > 0);
      }

      if (metadataMatch) {
        metadata.metadata = {};
        const lines = metadataMatch[1].split('\n');
        for (const line of lines) {
          const match = line.match(/^  (.+):\s*(.+)$/);
          if (match) {
            metadata.metadata[match[1]] = match[2].trim();
          }
        }
      }

      return metadata;
    } catch (error) {
      console.error(`[SkillLoader] Failed to parse skill metadata: ${skillMdPath}`, error);
      return null;
    }
  }

  /**
   * Infer argument hint from skill metadata
   */
  private inferArgumentHint(skill: SkillMetadata): string {
    // Check for common argument patterns in metadata
    if (skill.metadata?.argument) {
      return skill.metadata.argument;
    }

    // Check allowed tools for hints
    if (skill.allowedTools && skill.allowedTools.length > 0) {
      const tool = skill.allowedTools[0];
      if (tool.includes('file') || tool.includes('read')) {
        return '<file>';
      }
      if (tool.includes('search') || tool.includes('grep')) {
        return '<query>';
      }
    }

    // Default to no arguments
    return '';
  }
}

/**
 * Create a skill loader instance
 */
export function createSkillLoader(skillDirs?: string[], cwd?: string): SkillLoader {
  return new SkillLoader(skillDirs, cwd);
}
