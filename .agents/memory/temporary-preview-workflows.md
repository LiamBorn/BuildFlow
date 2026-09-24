---
name: Temporary preview workflows
description: Replit workflow configuration can persist in app configuration after a temporary verification run.
---

When a temporary preview workflow is created, Replit can add workflow metadata to the app configuration. Removing the workflow may leave an empty workflow section behind.

**Why:** A transient verification run should not inadvertently alter the project's intended Run and Publish configuration.

**How to apply:** After temporary workflow removal, compare the app configuration with its prior version and restore it through the supported configuration replacement mechanism if needed. Do not assume removal reverts metadata.