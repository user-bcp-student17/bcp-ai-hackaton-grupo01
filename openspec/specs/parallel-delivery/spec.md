# parallel-delivery Specification

## Purpose
Let p1 groups be built and verified in parallel without waiting on one another.

## Requirements

### Requirement: Independently buildable groups
Each group SHALL be implementable and testable using only the Contracts and its own test doubles, without code from another open group.

#### Scenario: Group builds without its neighbour
- **WHEN** a worker implements a group while the group it used to wait on is unmerged
- **THEN** its tests pass using a fake port or API mock that follows the Contract

#### Scenario: Fake matches the Contract
- **WHEN** a fake or mock is exercised in the group's tests
- **THEN** its request and response shapes match the Contract exactly, including error codes

### Requirement: Contracts stay unchanged
A group SHALL NOT alter a Contract or create or edit a shared schema file owned by another group.

#### Scenario: Missing shared schema
- **WHEN** a shared schema is not merged yet
- **THEN** the group declares minimal types inside its own feature folder and leaves the contracts package untouched

### Requirement: Disjoint file ownership
Each group SHALL edit only its own feature folder, plus one additive registration line in the shared app entry file.

#### Scenario: Concurrent merge
- **WHEN** two groups register in the same entry file
- **THEN** the later PR rebases and keeps both lines
