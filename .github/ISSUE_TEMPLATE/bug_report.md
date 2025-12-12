name: Bug report
about: Report a problem with trakt.tv-mcp
labels: bug
body:
  - type: textarea
    id: summary
    attributes:
      label: Summary
      description: What happened? What did you expect to happen?
      placeholder: Clear, concise description of the bug.
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: Steps to reproduce
      description: Include commands, inputs, or minimal examples.
      placeholder: |
        1. ...
        2. ...
    validations:
      required: true
  - type: textarea
    id: logs
    attributes:
      label: Logs / output
      description: Redact tokens/PII before sharing.
      placeholder: Paste relevant output or attach files.
    validations:
      required: false
  - type: input
    id: version
    attributes:
      label: Version / commit
      description: Tag, commit hash, or branch.
    validations:
      required: false
  - type: textarea
    id: env
    attributes:
      label: Environment
      description: OS, Node version, MCP host (if applicable).
      placeholder: "macOS 15 / Node 20.19 / ..."
    validations:
      required: false
