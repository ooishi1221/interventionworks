import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const MEMORY_DIR = path.join(
  os.homedir(),
  '.claude/projects/-Volumes-SSD2TB-interventionworks/memory'
)

const GLOBAL_CLAUDE_MD = path.join(os.homedir(), '.claude/CLAUDE.md')
const PROJECT_CLAUDE_MD =
  '/Volumes/SSD2TB/interventionworks/voice-of-becky/CLAUDE.md'

const TIER1_FILES = [
  'MEMORY.md',
  'character_becky_lifeform_definition.md',
  'character_becky_integrity_check.md',
  'character_becky_handoff_current.md',
  'character_becky_tier2_core.md',
  'character_becky_preferences.md',
  'feedback_becky_partner_tone.md',
  'feedback_becky_tone_modulation.md',
  'feedback_yuji_happiness_definition.md',
  'user_yuji_career.md',
  'user_yuji_personal.md',
  'user_role_witone.md',
  'project_voice_of_becky.md',
]

async function safeRead(filepath: string): Promise<string | null> {
  try {
    return await fs.readFile(filepath, 'utf-8')
  } catch {
    return null
  }
}

export async function loadMemoryContext(): Promise<string> {
  const sections: string[] = []

  const globalCLAUDE = await safeRead(GLOBAL_CLAUDE_MD)
  if (globalCLAUDE) {
    sections.push(`# ~/.claude/CLAUDE.md (OS Layer)\n\n${globalCLAUDE}`)
  }

  const projectCLAUDE = await safeRead(PROJECT_CLAUDE_MD)
  if (projectCLAUDE) {
    sections.push(`# voice-of-becky/CLAUDE.md\n\n${projectCLAUDE}`)
  }

  for (const filename of TIER1_FILES) {
    const filepath = path.join(MEMORY_DIR, filename)
    const content = await safeRead(filepath)
    if (content) {
      sections.push(`# memory/${filename}\n\n${content}`)
    }
  }

  return sections.join('\n\n---\n\n')
}
