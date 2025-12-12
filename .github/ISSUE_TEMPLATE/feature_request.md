name: Feature request
about: Suggest an idea or improvement
labels: enhancement
body:
  - type: textarea
    id: summary
    attributes:
      label: Summary
      description: What do you want to see improved or added?
    validations:
      required: true
  - type: textarea
    id: motivation
    attributes:
      label: Motivation
      description: Why is this valuable? Who benefits?
    validations:
      required: true
  - type: textarea
    id: proposal
    attributes:
      label: Proposal
      description: Outline the desired behavior, API changes, or UX.
    validations:
      required: false
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives
      description: Other solutions you’ve considered.
    validations:
      required: false
