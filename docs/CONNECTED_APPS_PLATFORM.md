# Registered Google Connected App: Disable Per-Write Confirmation

The manually added custom MCP route in Gemini still asks for confirmation on each write. To configure confirmation without a per-call prompt, register ArgonDesk through Google's Connected Apps Platform. This is a separate route; it is not an Always allow switch for an existing custom app.

## 1. Check platform access

Open [Google Connected Console](https://connected.google.com/). The platform is in preview and may require preview access and acceptance of its terms. If your account cannot create an app, resolve platform access first.

Keep the existing Gemini custom app until the registered app has passed end-to-end testing.

## 2. Verify the domain

1. Update and start ArgonDesk 0.4.4.
2. Keep your configured ngrok HTTPS domain and tunnel online.
3. In the local dashboard, copy the domain-verification URL from the Registered Connected App card.
4. Create an MCP Connected App in Connected Console and download the Google verification JSON file.
5. Paste the complete JSON file into the ArgonDesk verification field and save it.
6. Return to Connected Console and verify the domain.

ArgonDesk serves the verification response at:

    https://your-domain/.well-known/google-connected-apps

The ngrok traffic policy exposes only the registered OAuth MCP endpoint, the legacy keyed endpoint, OAuth metadata/token routes and the exact verification, privacy, terms and help paths. The local dashboard and other paths remain private.

## 3. App metadata

**Description**

Read, create, and edit UTF-8 text files in a user-selected Windows workspace.

**Icon**

Upload app-icon-512.png (512 × 512 PNG).

Choose the app category carefully; Google does not let you change it after creation.

**Capabilities**

- Inspect the selected workspace and its access mode.
- Browse folders and read UTF-8 text files.
- Create and edit text files within the selected folder.

**Example prompts**

- @ArgonDesk inspect the selected workspace and summarize its folders.
- @ArgonDesk create a new README in the selected project folder.
- Use ArgonDesk to update the notes in my selected workspace.

**Public URLs**

- Terms of Service: your HTTPS domain plus /terms
- Privacy Policy: your HTTPS domain plus /privacy
- Help: your HTTPS domain plus /help

Use the **Registered-app MCP endpoint** displayed in the OAuth section of the ArgonDesk dashboard. It is the HTTPS domain followed by /mcp and is protected by machine-to-machine OAuth. Do not use the legacy custom-app URL shown in the connection section; that URL includes a path key and retains the old confirmation behavior.

For the credential step, choose **Yes → Machine-to-machine OAuth Client Credentials**. In ArgonDesk, generate an OAuth credential pair, then copy the Client ID and Client Secret into Connected Console. The token endpoint is advertised at /.well-known/oauth-authorization-server; if Console asks for it explicitly, use the endpoint displayed in ArgonDesk. Leave the authorization endpoint blank.

The client secret is encrypted with the current Windows user's DPAPI at rest and shown only once after generation. If it is lost, rotate the pair and update Connected Console. Keep the Require OAuth on the public MCP endpoint switch off until the registered app has passed testing; enable it afterward to block the legacy custom-app connection.

## 4. Disable per-tool confirmation

After syncing the tools in Connected Console, review each tool's User confirmation required setting:

| Tool | User confirmation required |
| --- | --- |
| workspace_info | Off |
| list_files | Off |
| read_file | Off |
| write_file | **Off** |
| edit_file | **Off** |
| create_directory | **Off** |

The write tools correctly retain their destructiveHint annotation, so Google may preselect confirmation. Clear the setting in Connected Console for this registered app; do not change the annotation to disguise a write tool as read-only.

Add your own Google account as a tester, connect the registered ArgonDesk app in Gemini, then test reading, creating and editing. Google may still apply separate safeguards to some actions.

## 5. Preview and release

Complete end-to-end testing in the tester-only preview first. Google requires app review before public release; preview access, review and regional availability are controlled by Google.

Whether your ngrok domain is accepted for domain verification must be confirmed in Connected Console. If Google rejects it, use a verifiable domain you control and update ArgonDesk's domain validation and tunnel configuration. Do not bypass domain verification.

## Official references

- [Connected Apps Platform: registration, testing and release](https://developers.google.com/connected-apps/gpc/perform-the-steps)
- [Connected Apps Platform prerequisites](https://developers.google.com/connected-apps/gpc/prerequisites)
- [Gemini: connect and manage custom apps](https://support.google.com/gemini/answer/17209137)
