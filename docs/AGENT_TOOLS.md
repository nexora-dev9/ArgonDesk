# Search, organization, builds and tests · 0.4.6

[简体中文](AGENT_TOOLS.zh-CN.md) · [Overview](../README.md)

Call `workspace_info` once and reuse its `workspace_id`. All tools require enabled file access. Path arguments must be relative to the selected root: absolute paths, `..`, NTFS streams, aliases and links are rejected. The root cannot be moved, overwritten or deleted. Folder/access changes and restarts invalidate the old ID.

| Tool | Parameters besides workspace_id | Defaults and results |
| --- | --- | --- |
| `find_files` | `pattern`, `path="."`, `max_results=200` | Filename fragment or glob, e.g. `**/*.{py,js}`. Returns `results[{path,size}]`; result limit 1–1000 |
| `search_text` | `query`, `path="."`, `regex=false`, `case_sensitive=false`, `max_results=100` | Returns `results[{path,line_number,column,text,line_truncated}]`; lines/columns start at 1 |
| `move_path` | `src`, `dst`, `overwrite=false` | Moves/renames files or directories; creates parents, rejects overlapping source/destination |
| `delete_path` | `path`, `to_trash=true` | Windows Shell recycling by default, with no permanent fallback. `false` explicitly requests permanent deletion |
| `run_command` | `command`, `cwd="."`, `timeout_sec=120` | PowerShell 5.1; timeout 1–600 seconds, command up to 8000 characters. Returns exit_code, stdout/stderr, duration and truncation/timeout/cancellation flags |

Search skips node_modules, .venv, .git, __pycache__, dist and build, and never follows links. find_files returns files, not directories. Plain names match filename fragments, case-insensitively. Patterns containing slashes match paths relative to the workspace root; path narrows traversal. search_text streams plain text larger than 2 MiB; it does not extract Office/PDF text (use read_file). Lines over 65,536 characters are skipped and counted; matching previews are capped at 1000 characters. A scan has a 100,000-file, approximately 8-second and response-size budget; pathological regexes run in a separate worker and stop after 10 seconds. Check truncation/skipped counters, narrow path or use read_file cursors.

An overwrite move first retains the old target. After the move succeeds it tries recycling that copy; a failed recycle returns previous_target_backup pointing to the retained copy. Cross-filesystem renames may fail; there is no automatic copy-and-delete fallback.

## Preferences

Open the gear button or bottom-left **Preferences**:

- **Connect the tunnel when opened** uses the ngrok account saved in Connection.
- **Enable file access on startup** restores the selected folder and saved access.
- **Allow AI to move and delete files** controls move_path/delete_path.
- **Allow AI to run workspace commands** controls run_command.

The last two also require enabled **Read and edit** access. Clean installs do not grant these automatically. Enabling startup restoration does not immediately unpause the current session; open ArgonDesk from the desktop/tray or use Enable file access. Stopping the tunnel also turns off tunnel autostart; re-enable it if desired.

**Command permission is current-user Windows shell access.** Only its starting cwd is checked. Commands can access other folders, networks and programs; this is not an OS sandbox and does not elevate privileges. Use an isolated account/container/VM for strict isolation. Pausing, switching folders, revoking commands or stopping the service terminates active commands and their descendants. stdout/stderr each retain about 16 KiB with a head/tail truncation marker. Timeout exits with 124; cancellation with 130. Nonzero exits return an MCP error alongside the detailed JSON result.

Activity records tool, target/command, result, duration and exit code, keeping the latest 100 events. It logs commands and search terms, not file contents or command output. Do not embed credentials in command strings.

## Editing and testing

Ask Gemini to locate relevant sources, batch replacements and run the required test/build command from the correct subdirectory. Report actual exit codes and necessary errors. edit_file matches normalized LF/CRLF, retains the original newline style and unchanged content, and commits only after every replacement matches uniquely. Text writes/edits retain the 2 MiB limit; they cannot edit binary Office packages directly.

Source installs must run Build.ps1 to generate both ArgonDesk.exe and ArgonDesk.WorkspaceHost.exe. The helper implements Windows process jobs and recycling. Updated MCP discovery exposes eleven tools; refresh the app/start a fresh task if Gemini caches the previous six. Local standard MCP verification is separate from website acceptance, model tool choice and Google's confirmation settings.
