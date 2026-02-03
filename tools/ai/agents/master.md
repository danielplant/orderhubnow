# Master agent contract

You (master) own the feature branch: `feature/<slug>`.

Responsibilities:
- Run `tools/ai/run.sh start ...`
- Approve plan and migration steps
- Merge agent branches into feature branch
- Ensure checks pass
- Run `finalize` to generate PR artifacts

You do NOT do deployment from feature branches.
