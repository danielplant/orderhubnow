#!/usr/bin/env npx ts-node
/**
 * Comprehensive Hydration Safety Checker
 *
 * Scans the codebase for patterns that can cause React hydration mismatches
 * between server and client rendering.
 *
 * Usage:
 *   npx ts-node scripts/check-hydration.ts [--fix] [--strict]
 *
 * Options:
 *   --fix     Auto-fix issues where possible
 *   --strict  Treat warnings as errors (for CI/deploy)
 */

import * as fs from 'fs'
import * as path from 'path'

// =============================================================================
// Types
// =============================================================================

type Severity = 'error' | 'warning' | 'info'

interface HydrationIssue {
  file: string
  line: number
  column?: number
  pattern: string
  message: string
  severity: Severity
  fixable: boolean
  fix?: {
    search: string
    replace: string
  }
}

interface PatternCheck {
  name: string
  pattern: RegExp
  severity: Severity
  message: string
  fixable: boolean
  // Only check in client components (files with 'use client' or in specific dirs)
  clientOnly?: boolean
  // Exclude patterns (e.g., inside useEffect is safe)
  excludePatterns?: RegExp[]
  // Function to generate fix
  getFix?: (match: string, fullLine: string) => { search: string; replace: string } | null
}

// =============================================================================
// Hydration Risk Patterns
// =============================================================================

const HYDRATION_PATTERNS: PatternCheck[] = [
  // Date-specific formatting without locale (these are ERRORS - they definitely cause hydration issues)
  {
    name: 'date-toLocaleDateString-no-locale',
    pattern: /\.toLocaleDateString\(\s*\)/g,
    severity: 'error',
    message: 'toLocaleDateString() without locale causes hydration mismatch. Use formatDate() from @/lib/utils/format',
    fixable: false,
    clientOnly: true,
  },
  {
    name: 'date-toLocaleTimeString-no-locale',
    pattern: /\.toLocaleTimeString\(\s*\)/g,
    severity: 'error',
    message: 'toLocaleTimeString() without locale causes hydration mismatch. Use formatDateTime() from @/lib/utils/format',
    fixable: false,
    clientOnly: true,
  },
  // new Date().toLocaleString() - definitely a date (ERROR)
  {
    name: 'new-date-toLocaleString',
    pattern: /new Date\([^)]*\)\.toLocaleString\(\s*\)/g,
    severity: 'error',
    message: 'new Date().toLocaleString() causes hydration mismatch. Use formatDateTime() from @/lib/utils/format',
    fixable: false,
    clientOnly: true,
  },
  // Variable that looks like a date (ends with Date, At, Time) calling toLocaleString
  {
    name: 'date-var-toLocaleString',
    pattern: /\b\w*(Date|At|Time|date|at|time)\)?\.toLocaleString\(\s*\)/g,
    severity: 'error',
    message: 'Date.toLocaleString() causes hydration mismatch. Use formatDateTime() from @/lib/utils/format',
    fixable: false,
    clientOnly: true,
  },

  // Random values in render
  {
    name: 'math-random-render',
    pattern: /Math\.random\(\)/g,
    severity: 'warning',
    message: 'Math.random() produces different values on server vs client. Move to useEffect or use deterministic IDs',
    fixable: false,
    clientOnly: true,
    excludePatterns: [/useEffect/, /useCallback/, /useMemo/, /onClick/, /onChange/, /onSubmit/, /handle[A-Z]\w*\s*=/, /const handle/, /function handle/, /async\s*\(/],
  },

  // Date.now() in render (not in useEffect/handlers)
  {
    name: 'date-now-render',
    pattern: /Date\.now\(\)/g,
    severity: 'warning',
    message: 'Date.now() produces different values on server vs client. Consider moving to useEffect',
    fixable: false,
    clientOnly: true,
    excludePatterns: [/useEffect/, /useCallback/, /useMemo/, /onClick/, /onChange/, /onSubmit/, /setTimeout/, /setInterval/, /handle[A-Z]\w*\s*=/, /const handle/, /function handle/, /async\s*\(/],
  },

  // new Date() without args in JSX (creates current time)
  {
    name: 'new-date-render',
    pattern: /\{[^}]*new Date\(\s*\)[^}]*\}/g,
    severity: 'warning',
    message: 'new Date() in JSX creates current time which differs between server/client. Pass date as prop or use useEffect',
    fixable: false,
    clientOnly: true,
    excludePatterns: [/useCallback/, /handle[A-Z]\w*\s*=/, /const handle/, /function handle/],
  },

  // typeof window checks (can cause content mismatch if used in render path)
  {
    name: 'typeof-window-conditional',
    pattern: /typeof\s+window\s*(!==?|===?)\s*['"]undefined['"]/g,
    severity: 'info',
    message: 'typeof window check can cause hydration mismatch if used for conditional rendering. Use useEffect + useState instead',
    fixable: false,
    clientOnly: true,
    // Safe when inside useEffect, useCallback, or event handlers
    excludePatterns: [/useEffect/, /useCallback/, /useMemo/, /handle[A-Z]\w*\s*=/, /const handle/, /function handle/],
  },

  // Direct window access without check
  {
    name: 'window-direct-access',
    pattern: /window\.(innerWidth|innerHeight|scrollX|scrollY|location(?!\.)|navigator|localStorage|sessionStorage)/g,
    severity: 'warning',
    message: 'Direct window property access can fail on server. Wrap in useEffect or add typeof window check',
    fixable: false,
    clientOnly: true,
    excludePatterns: [/useEffect/, /useCallback/, /typeof window/, /handle[A-Z]\w*\s*=/, /const handle/, /function handle/, /async\s*\(/],
  },

  // localStorage/sessionStorage access
  {
    name: 'storage-access',
    pattern: /(?<!window\.)(localStorage|sessionStorage)\./g,
    severity: 'warning',
    message: 'Storage access fails on server. Wrap in useEffect or add typeof window check',
    fixable: false,
    clientOnly: true,
    excludePatterns: [/useEffect/, /useCallback/, /typeof window/, /typeof localStorage/, /typeof sessionStorage/, /handle[A-Z]\w*\s*=/, /const handle/, /function handle/, /async\s*\(/],
  },

  // navigator access
  {
    name: 'navigator-access',
    pattern: /(?<!window\.)navigator\./g,
    severity: 'warning',
    message: 'navigator is not available on server. Wrap in useEffect or add typeof window check',
    fixable: false,
    clientOnly: true,
    excludePatterns: [/useEffect/, /useCallback/, /typeof window/, /typeof navigator/, /handle[A-Z]\w*\s*=/, /const handle/, /function handle/, /async\s*\(/],
  },

  // document access
  {
    name: 'document-access',
    pattern: /(?<!window\.)document\.(getElementById|querySelector|querySelectorAll|body|head|cookie)/g,
    severity: 'warning',
    message: 'document is not available on server. Wrap in useEffect or use refs',
    fixable: false,
    clientOnly: true,
    excludePatterns: [/useEffect/, /useCallback/, /typeof document/, /handle[A-Z]\w*\s*=/, /const handle/, /function handle/, /async\s*\(/],
  },
]

// =============================================================================
// File Discovery
// =============================================================================

function getSourceFiles(dir: string): string[] {
  const files: string[] = []

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)

      // Skip node_modules, .next, etc.
      if (entry.isDirectory()) {
        if (['node_modules', '.next', '.git', 'dist', 'build', 'coverage'].includes(entry.name)) {
          continue
        }
        walk(fullPath)
      } else if (entry.isFile()) {
        // Only check .ts, .tsx, .js, .jsx files
        if (/\.(tsx?|jsx?)$/.test(entry.name)) {
          files.push(fullPath)
        }
      }
    }
  }

  walk(dir)
  return files
}

// =============================================================================
// Client Component Detection
// =============================================================================

function isClientComponent(content: string, filePath: string): boolean {
  // Check for 'use client' directive
  if (/^['"]use client['"]/.test(content.trim())) {
    return true
  }

  // Check if in components directory (likely client)
  if (filePath.includes('/components/')) {
    return true
  }

  // Check if in app directory but not a page/layout/route (those are server by default)
  if (filePath.includes('/app/')) {
    const fileName = path.basename(filePath)
    // Server components
    if (/^(page|layout|loading|error|not-found)\.(tsx?|jsx?)$/.test(fileName)) {
      // Unless they have 'use client'
      return /^['"]use client['"]/.test(content.trim())
    }
    // API routes are server-only
    if (filePath.includes('/api/')) {
      return false
    }
  }

  return false
}

function isServerOnlyFile(filePath: string): boolean {
  // API routes
  if (filePath.includes('/api/')) return true

  // Server actions
  if (filePath.includes('/actions/')) return true

  // Data queries
  if (filePath.includes('/queries/')) return true

  // Lib files (unless they're hooks)
  if (filePath.includes('/lib/') && !filePath.includes('/hooks/')) {
    return true
  }

  return false
}

// =============================================================================
// Pattern Checking
// =============================================================================

function checkFile(filePath: string, patterns: PatternCheck[]): HydrationIssue[] {
  const issues: HydrationIssue[] = []
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')

  const isClient = isClientComponent(content, filePath)
  const isServerOnly = isServerOnlyFile(filePath)

  // Skip server-only files entirely
  if (isServerOnly) {
    return []
  }

  for (const pattern of patterns) {
    // Skip client-only patterns for server components
    if (pattern.clientOnly && !isClient) {
      continue
    }

    // Check each line
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum]

      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
        continue
      }

      // Skip imports
      if (line.trim().startsWith('import ')) {
        continue
      }

      // Check for pattern
      const matches = line.matchAll(pattern.pattern)

      for (const match of matches) {
        // Check if excluded by context
        let excluded = false

        if (pattern.excludePatterns) {
          // Check surrounding lines for exclusion patterns (wide window to catch handler definitions)
          const contextStart = Math.max(0, lineNum - 40)
          const contextEnd = Math.min(lines.length - 1, lineNum + 5)
          const context = lines.slice(contextStart, contextEnd + 1).join('\n')

          for (const excludePattern of pattern.excludePatterns) {
            if (excludePattern.test(context)) {
              excluded = true
              break
            }
          }
        }

        if (excluded) continue

        const issue: HydrationIssue = {
          file: filePath,
          line: lineNum + 1,
          column: match.index,
          pattern: pattern.name,
          message: pattern.message,
          severity: pattern.severity,
          fixable: pattern.fixable,
        }

        if (pattern.fixable && pattern.getFix) {
          const fix = pattern.getFix(match[0], line)
          if (fix) {
            issue.fix = fix
          }
        }

        issues.push(issue)
      }
    }
  }

  return issues
}

// =============================================================================
// Auto-Fix
// =============================================================================

function applyFixes(issues: HydrationIssue[]): number {
  let fixCount = 0
  const fileIssues = new Map<string, HydrationIssue[]>()

  // Group fixable issues by file
  for (const issue of issues) {
    if (issue.fixable && issue.fix) {
      const existing = fileIssues.get(issue.file) || []
      existing.push(issue)
      fileIssues.set(issue.file, existing)
    }
  }

  // Apply fixes file by file
  for (const [filePath, fileIssueList] of fileIssues) {
    let content = fs.readFileSync(filePath, 'utf-8')

    for (const issue of fileIssueList) {
      if (issue.fix && content.includes(issue.fix.search)) {
        content = content.replace(issue.fix.search, issue.fix.replace)
        fixCount++
      }
    }

    fs.writeFileSync(filePath, content, 'utf-8')
  }

  return fixCount
}

// =============================================================================
// Reporting
// =============================================================================

function printIssues(issues: HydrationIssue[], rootDir: string): void {
  const errors = issues.filter(i => i.severity === 'error')
  const warnings = issues.filter(i => i.severity === 'warning')
  const infos = issues.filter(i => i.severity === 'info')

  const colorize = {
    error: (s: string) => `\x1b[31m${s}\x1b[0m`,
    warning: (s: string) => `\x1b[33m${s}\x1b[0m`,
    info: (s: string) => `\x1b[36m${s}\x1b[0m`,
    dim: (s: string) => `\x1b[90m${s}\x1b[0m`,
    bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  }

  if (issues.length === 0) {
    console.log(colorize.bold('\n✓ No hydration risks detected!\n'))
    return
  }

  console.log(colorize.bold('\n=== Hydration Safety Report ===\n'))

  // Group by file
  const byFile = new Map<string, HydrationIssue[]>()
  for (const issue of issues) {
    const relative = path.relative(rootDir, issue.file)
    const existing = byFile.get(relative) || []
    existing.push(issue)
    byFile.set(relative, existing)
  }

  for (const [file, fileIssues] of byFile) {
    console.log(colorize.bold(`\n${file}`))

    for (const issue of fileIssues) {
      const severityLabel = {
        error: colorize.error('ERROR'),
        warning: colorize.warning('WARN'),
        info: colorize.info('INFO'),
      }[issue.severity]

      console.log(`  ${severityLabel} Line ${issue.line}: ${issue.message}`)
      console.log(colorize.dim(`         Pattern: ${issue.pattern}`))
    }
  }

  console.log(colorize.bold('\n=== Summary ==='))
  console.log(`  ${colorize.error(`Errors: ${errors.length}`)}`)
  console.log(`  ${colorize.warning(`Warnings: ${warnings.length}`)}`)
  console.log(`  ${colorize.info(`Info: ${infos.length}`)}`)
  console.log('')
}

// =============================================================================
// Main
// =============================================================================

function main() {
  const args = process.argv.slice(2)
  const shouldFix = args.includes('--fix')
  const strictMode = args.includes('--strict')

  const rootDir = path.resolve(__dirname, '..')
  const srcDir = path.join(rootDir, 'src')

  console.log('Scanning for hydration risks...\n')

  const files = getSourceFiles(srcDir)
  console.log(`Checking ${files.length} files...`)

  let allIssues: HydrationIssue[] = []

  for (const file of files) {
    const issues = checkFile(file, HYDRATION_PATTERNS)
    allIssues = allIssues.concat(issues)
  }

  // Apply fixes if requested
  if (shouldFix) {
    const fixCount = applyFixes(allIssues)
    if (fixCount > 0) {
      console.log(`\nAuto-fixed ${fixCount} issues. Re-scanning...\n`)

      // Re-scan after fixes
      allIssues = []
      for (const file of files) {
        const issues = checkFile(file, HYDRATION_PATTERNS)
        allIssues = allIssues.concat(issues)
      }
    }
  }

  printIssues(allIssues, rootDir)

  // Determine exit code
  const errors = allIssues.filter(i => i.severity === 'error')
  const warnings = allIssues.filter(i => i.severity === 'warning')

  if (errors.length > 0) {
    console.log('\x1b[31mHydration check failed! Fix errors before deploying.\x1b[0m\n')
    process.exit(1)
  }

  if (strictMode && warnings.length > 0) {
    console.log('\x1b[33mHydration check failed in strict mode! Fix warnings before deploying.\x1b[0m\n')
    process.exit(1)
  }

  console.log('\x1b[32mHydration check passed!\x1b[0m\n')
  process.exit(0)
}

main()
