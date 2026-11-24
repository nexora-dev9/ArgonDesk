# Usage, thinking and creative quality

[简体中文](USAGE.zh-CN.md) · [README](../README.md)

## What 0.4.2 changes

WebAgy is the local file destination, not a subject the model needs to research. Its short MCP instructions explain this and ask the model to preserve detail, animation and interactivity.

For a simple new file, the available path is:

1. Call workspace_info once and reuse the returned workspace_id.
2. Send the complete artifact to write_file with mode=create.
3. Report its path. Inspect further only when the task needs it.

Create mode refuses to overwrite existing files and creates missing parent folders. It avoids a separate directory lookup merely to prevent a filename collision. Rewriting or editing an existing project still needs appropriate context; efficiency guidance is not permission to skip required inspection.

Successful results have one JSON text payload in content[0].text. The same file is no longer repeated in structuredContent. In a controlled local fixture, a 24,447-byte read changed from 60,917 to 33,384 bytes of result JSON, a 45.2% reduction. Tool discovery remains about 4 KB, with 685 bytes of startup guidance. **These are payload measurements, not model tokens or Google quota savings.** Clients decide what reaches the model.

Google's Task planning, model reasoning, client caching and accounting remain outside this project. The model can ignore guidance. No new Gemini prompts were sent to validate this release, and no claim of a measured quota or visual-quality improvement is made.

## Getting actual animation

A local file tool saves exactly the supplied text; it does not convert a static drawing into animation. Ask for real movement, not just an action-themed pose. For example:

> Create a detailed, self-contained animated SVG of an astronaut cat playing guitar in the current workspace. Save as space-cat-animated.svg. Implement looping arm movement, string vibration, tail motion and twinkling stars; a static pose is insufficient. Query the workspace once, then save the complete file. Inspect only relevant files. Report the path and animations implemented; state if no rendering test was performed.

The tool guidance prefers animation for action scenes unless a still is requested. This is an instruction to the model, not a backend animation generator or guarantee. Open the result and check playback. A successful write confirms saving, not visual correctness.

For standalone artwork that needs no existing local context, generating it in ordinary Chat and downloading the file can avoid Task tool rounds entirely. WebAgy is useful when the conversation needs to read, create and revise a local project.

## Thinking levels

Google's [model help](https://support.google.com/gemini/answer/18648722?hl=en) says an unselected thinking level defaults to Low. The Task menu inspected on 2026-10-16 exposed Flash and Argon without a thinking-level selector. That UI does not establish its hidden reasoning budget. WebAgy cannot read or set it through file tools; check the controls available to your account.

## Five-hour and weekly limits

Google documents [compute-based limits](https://support.google.com/gemini/answer/16275805?hl=en) affected by prompt complexity, model/features and conversation length. Five-hour and weekly caps use different totals. Reaching the shorter cap while most weekly allowance remains is possible; the weekly balance does not override it.

A 17% Chat run and a 27% Task run do not isolate the cause: output length, model, thinking, context and tool rounds may differ. WebAgy's request and byte counters cannot convert those percentages to tokens or reset/transfer either allowance.

## Startup and updating

Preferences → Enable file access on startup restores the selected folder and saved permission on each backend launch. It defaults off. Missing or replaced roots fail closed. Folder/permission changes pause immediately; with the preference on, restarting can enable that newly selected folder. A manual pause lasts for this run. Turn the preference off to retain paused startup.

After updating, reload the workbench and start a fresh Gemini task. If Google keeps an older tool schema without mode=create, refresh the custom app using the website's available controls. The private URL is unchanged. No long Insert prompt is required, and Google's manual write confirmation remains.
