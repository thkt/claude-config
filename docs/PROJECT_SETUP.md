# Project Setup Recommendations

This document contains recommendations for setting up Claude Code in your projects.

## Hooks Configuration

### Auto-formatting After File Edits

It's recommended to set up hooks in your project's `.claude/settings.json` to automatically run formatters after file modifications.

#### Example Configurations

**For projects using Biome:**

```json
{
  "hooks": {
    "after": {
      "Edit": "npm run check -- {{file_path}}",
      "MultiEdit": "npm run check -- {{file_path}}",
      "Write": "npm run check -- {{file_path}}"
    }
  }
}
```

**For projects using Prettier + ESLint:**

```json
{
  "hooks": {
    "after": {
      "Edit": "npx prettier --write {{file_path}} && npx eslint --fix {{file_path}}",
      "MultiEdit": "npx prettier --write {{file_path}} && npx eslint --fix {{file_path}}",
      "Write": "npx prettier --write {{file_path}} && npx eslint --fix {{file_path}}"
    }
  }
}
```

**For Deno projects:**

```json
{
  "hooks": {
    "after": {
      "Edit": "deno fmt {{file_path}}",
      "MultiEdit": "deno fmt {{file_path}}",
      "Write": "deno fmt {{file_path}}"
    }
  }
}
```

**For Python projects with Black:**

```json
{
  "hooks": {
    "after": {
      "Edit": "black {{file_path}}",
      "MultiEdit": "black {{file_path}}",
      "Write": "black {{file_path}}"
    }
  }
}
```

### Variables Available in Hooks

- `{{file_path}}`: The absolute path to the file that was edited
- Hooks run in the project root directory

### Best Practices

1. **Use existing npm scripts**: If your project has formatting scripts in package.json, use those
2. **Keep it fast**: Hooks run synchronously, so avoid long-running operations
3. **Handle errors gracefully**: Consider using `|| true` to prevent hook failures from blocking edits
4. **Project-specific**: Always configure hooks per-project, not globally

### Troubleshooting

If hooks are blocking your edits:

1. Check the command syntax
2. Ensure the formatter is installed
3. Temporarily disable hooks by removing/renaming `.claude/settings.json`
4. Check Claude Code output for error messages

## Other Project Settings

### Recommended .gitignore Entries

Add these to your project's `.gitignore`:

```markdown
# Claude Code temporary files
.claude/logs/
.claude/workspace/tasks/active/
```

### Workspace Structure

Consider creating:

```txt
.claude/
├── settings.json      # Project-specific Claude Code settings
├── workspace/         # Project knowledge base
│   └── index/        # Project patterns and decisions
└── CLAUDE.md         # Project-specific AI instructions
```
