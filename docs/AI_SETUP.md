# Have a coding agent set up ArgonDesk

[简体中文](AI_SETUP.zh-CN.md)

If your goal is “let Gemini's website directly read and edit a local folder without buying model API access”, this project supplies a Windows native-MCP workspace. Eleven tools add search, reading/writing, moving/recycling and separately authorized PowerShell builds/tests. Commands run as the current user, not in a folder-isolated OS sandbox. See [agent tools](AGENT_TOOLS.md).

Give a coding assistant the repository URL after publication and the following brief. The assistant should read the current project documentation, not reuse someone else's runtime config.

> Set up ArgonDesk on this Windows PC so my Gemini web conversation can operate only in a folder I choose. Use my existing eligible web account, not a paid model API. Read README, SETUP, SECURITY and NETWORKING first. Prepare and verify all local steps you can perform. Have me complete account sign-in and other actions that genuinely require me. Never print or publish account tokens, the full private MCP URL, browser state or real project contents. Preserve existing network settings unless I authorize a concrete change. Prove each connection layer separately, then have Gemini create a uniquely named test file in a disposable folder, approve its write and read it back. Report what passed and what remains unverified.

## Agent checklist

- Confirm Windows prerequisites and that the account exposes custom Connected Apps.
- Use a clean source or release package. Never copy a used installation's state.
- Use Start-ArgonDesk.cmd for first client setup; validate the official client signature.
- Let the human choose the folder and permission. Respect pause and changed workspace IDs.
- Configure the user's own ngrok domain/token locally. Do not ask for secrets in chat.
- For the legacy custom app, register the private MCP URL. For the no-prompt route, register the separate OAuth-protected endpoint shown in ArgonDesk's OAuth card.
- Use the tested English Task path if ordinary Chat does not invoke tools.
- Type @ and select the app; do not mix in old Insert instructions.
- For the registered app, configure machine-to-machine OAuth and clear per-tool confirmation for the three write tools. Keep the legacy route until the new app is tested.
- Verify actual file results, not a green indicator or a printed code block.
- Keep different tunnel providers marked unverified until genuinely tested.

The agent may automate authorized local installation and inspection. Account login, 2FA and provider acceptance may require the human. A browser login is not proof that a separate connector has switched accounts. Do not publish or change account bindings as an incidental setup step.
