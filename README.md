# AI RTL Forcer

A lightweight Tampermonkey userscript that improves right-to-left text display across several popular AI chat interfaces.

I created this project because I wanted a simple RTL solution, but did not feel comfortable installing a browser add-on from an unfamiliar developer with a relatively small user base. I wanted something whose entire behavior I could read, understand, and inspect myself. Tampermonkey and similar userscript managers provide a convenient way to distribute this kind of transparent, auditable script without hiding its behavior inside a compiled browser extension.

A major goal of this project is to remain **lightweight and unobtrusive**. I also found that many third-party add-ons use relatively heavy implementations that can place unnecessary load on the browser, which was another reason I wanted to build a smaller solution whose behavior and performance I could inspect myself. The script is designed to do as little work as necessary, avoid expensive repeated page scans, preserve each site's existing layout and behavior, and reduce the risk of broken interfaces, typing delays, or unnecessary browser load.

> **AI disclosure:** This script and its documentation were created with AI assistance and reviewed and tested by the project author.

The script is designed primarily for **Hebrew** and currently supports:

* ChatGPT
* Claude
* DeepSeek
* Gemini

It applies RTL styling where appropriate while keeping English text, code blocks, formulas, filenames, and other LTR content readable.

Gemini already handles Hebrew relatively well compared with the other supported interfaces. Its integration is therefore intentionally targeted at the specific response, composer, and editing cases where text could still resolve as LTR when it should not, rather than attempting to modify the entire interface.

## Features

### ChatGPT

* Forces the message composer to use RTL layout.
* Resolves Hebrew and English lines independently.
* Keeps English-only lines left-to-right.
* Applies special handling to mixed Hebrew-English lines.
* Supports editing previously sent user messages.
* Keeps attachment filenames isolated from the surrounding message direction.
* Avoids rescanning the entire editor on every keystroke.

### Claude

* Applies RTL direction to user messages and model responses.
* Supports the main composer and message-editing text boxes.
* Resolves Hebrew and English lines independently.
* Keeps English-only lines left-to-right.
* Applies a lightweight RTL override to mixed Hebrew-English lines.
* Keeps empty lines, placeholders, and the initial caret position on the right.
* Supports paragraph-like blocks and nested list items in the composer.
* Supports editing previously sent user messages using per-line bidirectional handling.
* Keeps code blocks, inline code, and mathematical expressions left-to-right.
* Adjusts lists and tables for RTL display.
* Updates only the active line while typing and avoids full editor rescans unless the editor structure changes.

### DeepSeek

* Applies RTL styling to content containing RTL characters.
* Handles dynamically added messages using a `MutationObserver`.
* Keeps code, scripts, textareas, and explicitly LTR elements unchanged.
* Supports both the main composer and message-editing textareas.
* Uses per-line bidirectional text handling in composer and edit fields.
* Keeps English-only lines left-to-right.
* Keeps empty textareas, placeholders, and the initial caret position on the right.
* Keeps DeepSeek's textarea mirror elements in the same bidirectional mode as the real input.
* Prevents the general page scanner from overriding composer and editing controls.
* Hides only the custom textarea scroll gutters that can appear because of bidirectional styling.
* Avoids interfering with DeepSeek's composer sizing, padding, and normal page scrolling.

### Gemini

* Applies targeted RTL fixes to model responses, the composer, and message-editing surfaces.
* Supports Gemini's rich-text composer and compatible editing text boxes.
* Resolves Hebrew and English lines independently.
* Keeps English-only lines left-to-right.
* Applies a lightweight RTL override to mixed Hebrew-English lines.
* Keeps empty lines, placeholders, and the initial caret position on the right.
* Supports paragraph-like blocks and nested list items.
* Includes native textarea fallbacks for alternative editing interfaces.
* Keeps code blocks and inline code left-to-right.
* Updates only the active line while typing and avoids full editor rescans unless the editor structure changes.

*Bonus:* Fixes an unrelated Gemini interface issue where the fullscreen/expand control can overlap the first line of text after the input grows to multiple lines. The script adds a small buffer above the text and repositions the control while keeping only the actual buttons clickable.

## Installation

1. Install a userscript manager:

   * [Tampermonkey](https://www.tampermonkey.net/)
   * [Violentmonkey](https://violentmonkey.github.io/)

2. Create a new userscript.

3. Replace the default contents with the contents of the script file.

4. Save the script.

5. Reload ChatGPT, Claude, DeepSeek, or Gemini.

## Usage

RTL mode is enabled by default.

You can enable or disable it using either:

* The userscript manager menu command:
  **הפעל/כבה תצוגת ימין לשמאל**

* The keyboard shortcut:

```text
Ctrl + Shift + R
```

The enabled state is stored locally by the userscript manager.

## Hebrew and Arabic Support

This script was designed and tested primarily for **Hebrew**.

Some parts of the RTL detection logic also recognize Arabic Unicode ranges. However, the layout behavior, mixed-text handling, selectors, and testing have not been specifically adapted or validated for Arabic-language usage.

Arabic support is therefore not officially provided.

Contributions are welcome, and users who need Arabic-specific behavior are encouraged to create a fork and adjust the detection rules, styling, and site-specific logic as needed.

## Privacy

The script:

* Does not send network requests.
* Does not collect analytics or telemetry.
* Does not read account credentials.
* Does not access cookies or authentication tokens.
* Does not transmit message contents.
* Does not use external dependencies.
* Stores only the local RTL enabled/disabled preference through the userscript manager.

All processing happens locally in the browser.

Because the script is distributed as readable source code, users are encouraged to inspect it before installation and verify that its behavior matches their expectations.

## Permissions

The script uses the following userscript APIs:

```javascript
GM_registerMenuCommand
GM_setValue
GM_getValue
```

These permissions are used only to:

* Register the RTL toggle in the userscript manager menu.
* Save the enabled or disabled state locally.
* Restore that state after the page is reloaded.

## Supported Domains

The script currently runs on:

```text
claude.ai
chat.deepseek.com
*.deepseek.com
chatgpt.com
*.chatgpt.com
chat.openai.com
gemini.google.com
```

## Compatibility

The script relies on site-specific DOM selectors and CSS classes.

Because AI chat websites change their interfaces regularly, parts of the script may stop working after a site update. When reporting an issue, include:

* The affected website.
* The browser and userscript manager.
* A description of the incorrect behavior.
* Whether the issue affects the composer, user messages, model responses, code blocks, or mixed-language text.

Please do not include private conversation content in issue reports.

## Known Limitations

* Site interface updates may break individual selectors.
* Mixed RTL-LTR text can still behave differently depending on browser bidi rendering.
* Model responses that are entirely or mostly English may sometimes remain right-to-left. This is intentional for now because automatically detecting and switching only English model responses to LTR in a reliable way is risky and complex. A safe implementation would need to distinguish between whole English answers, mixed Hebrew-English answers, individual English-heavy sections, lists, tables, code blocks, inline code, and partially streamed responses without accidentally flipping Hebrew or mixed content, and without adding expensive DOM processing. In these cases, RTL mode can be temporarily toggled off with:

```text
Ctrl + Shift + R
```

## Contributing

Pull requests and forks are welcome.

Useful contributions may include:

* Fixes for updated site selectors.
* Better mixed-language handling.
* Support for additional AI chat interfaces.
* Browser compatibility improvements.
* Performance and reliability improvements that preserve the lightweight design.

Please keep changes local, transparent, lightweight, and privacy-preserving. New network requests, remote dependencies, analytics, telemetry, or computationally expensive page processing should be clearly documented and justified.

## Disclaimer

This is an unofficial community userscript.

It is not affiliated with, endorsed by, or maintained by OpenAI, Anthropic, DeepSeek, Google, Tampermonkey, or Violentmonkey.

The script was created with AI assistance, but its behavior should still be reviewed independently before installation. The supported websites may change without notice, which can affect compatibility.
