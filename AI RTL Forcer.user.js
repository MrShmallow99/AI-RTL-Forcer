// ==UserScript==
// @name         AI RTL Forcer (Claude + DeepSeek + ChatGPT + Gemini)
// @namespace    http://tampermonkey.net/
// @version      3.6.2
// @description  Forces RTL in Claude, DeepSeek, ChatGPT, and Gemini. English-only textbox lines switch to LTR with lightweight mixed-line handling where needed.
// @author       MrShmallow99
// @match        *://claude.ai/*
// @match        *://chat.deepseek.com/*
// @match        *://*.deepseek.com/*
// @match        *://chatgpt.com/*
// @match        *://*.chatgpt.com/*
// @match        *://chat.openai.com/*
// @match        *://gemini.google.com/*
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    let isRTL = GM_getValue('isRTL', true);

    const host = location.hostname.toLowerCase();
    const SITE = host === 'claude.ai' || host.endsWith('.claude.ai') ? 'claude'
               : host === 'chat.deepseek.com' || host.endsWith('.deepseek.com') ? 'deepseek'
               : host === 'chatgpt.com' || host.endsWith('.chatgpt.com') || host === 'chat.openai.com' ? 'chatgpt'
               : host === 'gemini.google.com' || host.endsWith('.gemini.google.com') ? 'gemini'
               : null;

    /* ======================== CLAUDE STRATEGY ============================== */
    const claude = (() => {
        let styleElement = null;
        let handlersInstalled = false;
        let nextEditorKey = 1;
        let pendingEditors = new WeakSet();

        const editorStates = new Map();

        const editorSelector = [
            '.ProseMirror[contenteditable="true"][data-testid="chat-input"]',
            '[contenteditable="true"][data-testid="chat-input"]',
            '[contenteditable="true"][role="textbox"][aria-label*="Claude"]',
            '[contenteditable="true"][role="textbox"][aria-multiline="true"]',
            '.ProseMirror[contenteditable="true"]'
        ].join(',');

        const rtlCharacterRegex =
            /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

        const englishCharacterRegex =
            /[A-Za-z]/;

        const invisibleCharactersRegex =
            /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

        const css = `
            [data-claude-rtl="true"] .font-claude-response,
            [data-claude-rtl="true"] [data-testid="user-message"],
            [data-claude-rtl="true"] .font-claude-message {
                direction: rtl !important;
                text-align: right !important;
            }

            /* Claude composer / edit text boxes. */
            [data-claude-rtl="true"] .ProseMirror[contenteditable="true"],
            [data-claude-rtl="true"] [contenteditable="true"][data-testid="chat-input"],
            [data-claude-rtl="true"] [contenteditable="true"][role="textbox"][aria-multiline="true"] {
                direction: rtl !important;
                text-align: right !important;
            }

            /*
             * Each top-level Claude paragraph/block resolves its own direction:
             * Hebrew-only => RTL, English-only => LTR. Mixed lines that start
             * with English are handled by the tiny JS override below.
             */
            [data-claude-rtl="true"] .ProseMirror[contenteditable="true"] > *,
            [data-claude-rtl="true"] [contenteditable="true"][data-testid="chat-input"] > *,
            [data-claude-rtl="true"] [contenteditable="true"][role="textbox"][aria-multiline="true"] > * {
                direction: rtl !important;
                text-align: start !important;
                unicode-bidi: plaintext !important;
            }

            /*
             * Empty Claude lines.
             * Every new empty line defaults to RTL/right until real text is typed.
             */
            [data-claude-rtl="true"] [data-ai-claude-rtl-empty-line="true"],
            [data-claude-rtl="true"] .ProseMirror[contenteditable="true"] > p:empty,
            [data-claude-rtl="true"] .ProseMirror[contenteditable="true"] > p:has(> br:only-child),
            [data-claude-rtl="true"] .ProseMirror[contenteditable="true"] > p:has(> .ProseMirror-trailingBreak:only-child),
            [data-claude-rtl="true"] [contenteditable="true"][data-testid="chat-input"] > p:empty,
            [data-claude-rtl="true"] [contenteditable="true"][data-testid="chat-input"] > p:has(> br:only-child),
            [data-claude-rtl="true"] [contenteditable="true"][role="textbox"][aria-multiline="true"] > p:empty,
            [data-claude-rtl="true"] [contenteditable="true"][role="textbox"][aria-multiline="true"] > p:has(> br:only-child),
            [data-claude-rtl="true"] [contenteditable="true"][role="textbox"][aria-multiline="true"][data-placeholder] {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: isolate !important;
            }

            [data-claude-rtl="true"] .ProseMirror[contenteditable="true"] > ul > li,
            [data-claude-rtl="true"] .ProseMirror[contenteditable="true"] > ol > li,
            [data-claude-rtl="true"] [contenteditable="true"][data-testid="chat-input"] > ul > li,
            [data-claude-rtl="true"] [contenteditable="true"][data-testid="chat-input"] > ol > li {
                direction: rtl !important;
                text-align: start !important;
                unicode-bidi: plaintext !important;
            }

            /*
             * Editing an already-sent Claude user message.
             * Claude currently uses a native textarea here, so plaintext gives
             * per-line browser bidi behavior without changing the whole box.
             */
            [data-claude-rtl="true"] textarea[aria-label="Edit message"],
            [data-claude-rtl="true"] textarea[data-cds="TextArea"][aria-label="Edit message"] {
                direction: rtl !important;
                text-align: start !important;
                unicode-bidi: plaintext !important;
            }

            [data-claude-rtl="true"] textarea[aria-label="Edit message"]:placeholder-shown,
            [data-claude-rtl="true"] textarea[data-cds="TextArea"][aria-label="Edit message"]:placeholder-shown {
                direction: rtl !important;
                text-align: right !important;
            }

            [data-claude-rtl="true"] textarea[aria-label="Edit message"]::placeholder,
            [data-claude-rtl="true"] textarea[data-cds="TextArea"][aria-label="Edit message"]::placeholder {
                direction: rtl !important;
                text-align: right !important;
            }

            [data-claude-rtl="true"] .font-ui.rounded-2xl.border {
                direction: rtl !important;
                text-align: right !important;
            }

            [data-claude-rtl="true"] pre,
            [data-claude-rtl="true"] code,
            [data-claude-rtl="true"] .code-block__code,
            [data-claude-rtl="true"] [class*="language-"],
            [data-claude-rtl="true"] .katex,
            [data-claude-rtl="true"] .katex-display {
                direction: ltr !important;
                text-align: left !important;
                unicode-bidi: isolate;
            }

            [data-claude-rtl="true"] .font-claude-response ul,
            [data-claude-rtl="true"] .font-claude-response ol {
                padding-right: 1.5em;
                padding-left: 0;
            }

            [data-claude-rtl="true"] .font-claude-response th,
            [data-claude-rtl="true"] .font-claude-response td {
                text-align: right !important;
            }
        `;

        function ensureStyle() {
            if (styleElement) return;

            styleElement = document.createElement('style');
            styleElement.id = 'claude-rtl-style';
            styleElement.textContent = css;

            (document.head || document.documentElement).appendChild(styleElement);
        }

        function isMixedLine(text) {
            const value = text || '';

            return (
                rtlCharacterRegex.test(value) &&
                englishCharacterRegex.test(value)
            );
        }

        function isEmptyLine(block) {
            const text =
                (block?.textContent || '')
                    .replace(invisibleCharactersRegex, '')
                    .trim();

            return text.length === 0;
        }

        function syncEmptyLine(block) {
            if (!(block instanceof Element)) {
                return;
            }

            if (isEmptyLine(block)) {
                block.setAttribute(
                    'data-ai-claude-rtl-empty-line',
                    'true'
                );
            } else {
                block.removeAttribute(
                    'data-ai-claude-rtl-empty-line'
                );
            }
        }

        function setsEqual(a, b) {
            if (a.size !== b.size) {
                return false;
            }

            for (const value of a) {
                if (!b.has(value)) {
                    return false;
                }
            }

            return true;
        }

        function renderMixedOverrides(state) {
            state.styleElement.textContent =
                Array.from(state.mixedIndexes)
                    .sort((a, b) => a - b)
                    .map((index) => `
                        [data-claude-rtl="true"]
                        [data-ai-claude-rtl-editor-key="${state.key}"]
                        > :nth-child(${index + 1}) {
                            direction: rtl !important;
                            text-align: right !important;
                            unicode-bidi: plaintext !important;
                        }
                    `)
                    .join('\n');
        }

        function pruneDisconnectedEditors() {
            for (const [editor, state] of editorStates) {
                if (editor.isConnected) {
                    continue;
                }

                state.styleElement.remove();
                editorStates.delete(editor);
            }
        }

        function scanAllLines(editor, state) {
            const nextMixedIndexes =
                new Set();

            const children =
                Array.from(editor.children);

            children.forEach((block, index) => {
                syncEmptyLine(block);

                if (isMixedLine(block.textContent)) {
                    nextMixedIndexes.add(index);
                }
            });

            state.childCount =
                children.length;

            if (
                !setsEqual(
                    state.mixedIndexes,
                    nextMixedIndexes
                )
            ) {
                state.mixedIndexes =
                    nextMixedIndexes;

                renderMixedOverrides(state);
            }
        }

        function ensureEditorState(editor) {
            pruneDisconnectedEditors();

            let state =
                editorStates.get(editor);

            if (state) {
                if (
                    editor.getAttribute(
                        'data-ai-claude-rtl-editor-key'
                    ) !== state.key
                ) {
                    editor.setAttribute(
                        'data-ai-claude-rtl-editor-key',
                        state.key
                    );
                }

                return state;
            }

            const key =
                `claude-rtl-${nextEditorKey++}`;

            const lineStyleElement =
                document.createElement('style');

            lineStyleElement.setAttribute(
                'data-ai-claude-rtl-line-overrides',
                key
            );

            (document.head || document.documentElement)
                .appendChild(lineStyleElement);

            state = {
                key,
                styleElement: lineStyleElement,
                childCount: -1,
                mixedIndexes: new Set()
            };

            editor.setAttribute(
                'data-ai-claude-rtl-editor-key',
                key
            );

            editorStates.set(
                editor,
                state
            );

            scanAllLines(
                editor,
                state
            );

            return state;
        }

        function getTopLevelBlock(editor) {
            const selection =
                window.getSelection();

            if (
                !selection ||
                !selection.anchorNode
            ) {
                return null;
            }

            let element =
                selection.anchorNode.nodeType ===
                Node.ELEMENT_NODE
                    ? selection.anchorNode
                    : selection.anchorNode.parentElement;

            if (
                !(element instanceof Element) ||
                !editor.contains(element)
            ) {
                return null;
            }

            while (
                element &&
                element.parentElement !== editor
            ) {
                element =
                    element.parentElement;
            }

            return (
                element &&
                element.parentElement === editor
            )
                ? element
                : null;
        }

        function syncActiveLine(editor) {
            if (
                !isRTL ||
                !editor.isConnected
            ) {
                return;
            }

            const state =
                ensureEditorState(editor);

            if (
                editor.children.length !==
                state.childCount
            ) {
                scanAllLines(
                    editor,
                    state
                );

                return;
            }

            const block =
                getTopLevelBlock(editor);

            if (!block) {
                return;
            }

            syncEmptyLine(block);

            const index =
                Array.prototype.indexOf.call(
                    editor.children,
                    block
                );

            if (index < 0) {
                return;
            }

            const mixed =
                isMixedLine(block.textContent);

            const wasMixed =
                state.mixedIndexes.has(index);

            if (mixed === wasMixed) {
                return;
            }

            if (mixed) {
                state.mixedIndexes.add(index);
            } else {
                state.mixedIndexes.delete(index);
            }

            renderMixedOverrides(state);
        }

        function scheduleSync(editor) {
            if (
                !(editor instanceof Element) ||
                pendingEditors.has(editor)
            ) {
                return;
            }

            pendingEditors.add(editor);

            requestAnimationFrame(() => {
                pendingEditors.delete(editor);
                syncActiveLine(editor);
            });
        }

        function findEditor(node) {
            const element =
                node instanceof Element
                    ? node
                    : node?.parentElement;

            if (!(element instanceof Element)) {
                return null;
            }

            if (
                element.matches(
                    editorSelector
                )
            ) {
                return element;
            }

            const editor =
                element.closest(
                    '[contenteditable="true"]'
                );

            return editor?.matches(
                editorSelector
            )
                ? editor
                : null;
        }

        function onFocusIn(event) {
            if (!isRTL) return;

            const editor =
                findEditor(event.target);

            if (editor) {
                ensureEditorState(editor);
            }
        }

        function onInput(event) {
            if (!isRTL) return;

            const editor =
                findEditor(event.target);

            if (editor) {
                scheduleSync(editor);
            }
        }

        function installHandlers() {
            if (handlersInstalled) {
                return;
            }

            document.addEventListener(
                'focusin',
                onFocusIn,
                true
            );

            document.addEventListener(
                'input',
                onInput,
                true
            );

            document.addEventListener(
                'compositionend',
                onInput,
                true
            );

            handlersInstalled = true;
        }

        function removeHandlers() {
            if (!handlersInstalled) {
                return;
            }

            document.removeEventListener(
                'focusin',
                onFocusIn,
                true
            );

            document.removeEventListener(
                'input',
                onInput,
                true
            );

            document.removeEventListener(
                'compositionend',
                onInput,
                true
            );

            handlersInstalled = false;
        }

        function initializeVisibleEditors() {
            document
                .querySelectorAll(
                    editorSelector
                )
                .forEach((editor) => {
                    ensureEditorState(editor);
                });
        }

        function clearEditorStates() {
            for (const [editor, state] of editorStates) {
                editor.removeAttribute(
                    'data-ai-claude-rtl-editor-key'
                );

                editor
                    .querySelectorAll('[data-ai-claude-rtl-empty-line="true"]')
                    .forEach((block) => {
                        block.removeAttribute(
                            'data-ai-claude-rtl-empty-line'
                        );
                    });

                state.styleElement.remove();
            }

            editorStates.clear();
            pendingEditors = new WeakSet();
        }

        function apply() {
            ensureStyle();

            if (!document.body) return;

            if (isRTL) {
                document.body.setAttribute('data-claude-rtl', 'true');

                installHandlers();
                initializeVisibleEditors();
            } else {
                document.body.removeAttribute('data-claude-rtl');

                removeHandlers();
                clearEditorStates();
            }
        }

        return { apply };
    })();

    /* ======================= DEEPSEEK STRATEGY ============================ */
    const deepseek = (() => {
        const config = {
            ignoredTags: new Set([
                'CODE',
                'PRE',
                'SCRIPT',
                'STYLE',
                'TEXTAREA',
                'KBD',
                'SAMP'
            ]),

            minRtlChars: 2,

            importantTags: new Set([
                'H1',
                'H2',
                'H3',
                'H4',
                'H5',
                'H6',
                'UL',
                'OL',
                'LI',
                'P',
                'BLOCKQUOTE',
                'TD',
                'TH'
            ])
        };

        let styleElement = null;
        let observer = null;
        let initialProcessed = false;
        let processFrame = 0;

        const pendingRoots =
            new Set();

        const css = `
            /*
             * DeepSeek real composer textarea + edit-message textarea.
             * Use plaintext so each line resolves independently:
             * Hebrew / mixed Hebrew-English => RTL,
             * English-only => LTR.
             *
             * Native textarea cannot safely force every empty internal line
             * to RTL without inserting invisible characters into the user's text
             * or building a custom overlay. This block keeps the fully-empty
             * textbox RTL while preserving the safe per-line language behavior.
             */
            [data-deepseek-rtl="true"] textarea[name="search"],
            [data-deepseek-rtl="true"] textarea[name="user query"],
            [data-deepseek-rtl="true"] .ds-textarea textarea.ds-textarea__textarea {
                direction: rtl !important;
                text-align: start !important;
                unicode-bidi: plaintext !important;
                overflow-x: hidden !important;
                scrollbar-width: none !important;
            }

            /*
             * Empty DeepSeek textareas.
             * Keep the caret on the right before the first character is typed.
             */
            [data-deepseek-rtl="true"] textarea[name="search"]:placeholder-shown,
            [data-deepseek-rtl="true"] textarea[name="user query"]:placeholder-shown,
            [data-deepseek-rtl="true"] .ds-textarea textarea.ds-textarea__textarea:placeholder-shown {
                direction: rtl !important;
                text-align: right !important;
            }

            [data-deepseek-rtl="true"] textarea[name="search"]::-webkit-scrollbar,
            [data-deepseek-rtl="true"] textarea[name="user query"]::-webkit-scrollbar,
            [data-deepseek-rtl="true"] .ds-textarea textarea.ds-textarea__textarea::-webkit-scrollbar {
                width: 0 !important;
                height: 0 !important;
                display: none !important;
            }

            [data-deepseek-rtl="true"] textarea[name="search"]::placeholder,
            [data-deepseek-rtl="true"] textarea[name="user query"]::placeholder,
            [data-deepseek-rtl="true"] .ds-textarea textarea.ds-textarea__textarea::placeholder {
                direction: rtl !important;
                text-align: right !important;
            }

            /*
             * DeepSeek has mirror divs next to the real textareas.
             * Keep them in the same bidi mode, but do not let the old scanner
             * decide the direction for the whole composer/edit box.
             */
            [data-deepseek-rtl="true"] textarea[name="search"] + div,
            [data-deepseek-rtl="true"] textarea[name="user query"] + .ds-textarea__mirror,
            [data-deepseek-rtl="true"] .ds-textarea textarea.ds-textarea__textarea + .ds-textarea__mirror {
                direction: rtl !important;
                text-align: start !important;
                unicode-bidi: plaintext !important;
            }

            [data-deepseek-rtl="true"] textarea[name="search"] + div:empty,
            [data-deepseek-rtl="true"] textarea[name="user query"] + .ds-textarea__mirror:empty,
            [data-deepseek-rtl="true"] .ds-textarea textarea.ds-textarea__textarea + .ds-textarea__mirror:empty {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: isolate !important;
            }

            /*
             * Hide DeepSeek's custom scroll gutters only for textarea wrappers.
             */
            [data-deepseek-rtl="true"] div:has(> textarea[name="search"]) > .ds-scroll-area__gutters,
            [data-deepseek-rtl="true"] div:has(> textarea[name="search"]) > .ds-scroll-area__gutters *,
            [data-deepseek-rtl="true"] .ds-textarea:has(textarea[name="user query"]) > .ds-scroll-area__gutters,
            [data-deepseek-rtl="true"] .ds-textarea:has(textarea[name="user query"]) > .ds-scroll-area__gutters *,
            [data-deepseek-rtl="true"] .ds-textarea:has(textarea.ds-textarea__textarea) > .ds-scroll-area__gutters,
            [data-deepseek-rtl="true"] .ds-textarea:has(textarea.ds-textarea__textarea) > .ds-scroll-area__gutters * {
                display: none !important;
                visibility: hidden !important;
                pointer-events: none !important;
            }
        `;

        const rtlRegex =
            /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\uFB1D-\uFB4F\uFB50-\uFDFF\uFE70-\uFEFF]/g;

        const textRootSelector =
            'p, li, blockquote, td, th, h1, h2, h3, h4, h5, h6';

        const composerElementSelector = [
            'textarea[name="search"]',
            'textarea[name="user query"]',
            'textarea.ds-textarea__textarea',
            '.ds-textarea__mirror'
        ].join(',');

        const directTextareaSelector = [
            'textarea[name="search"]',
            'textarea[name="user query"]',
            'textarea.ds-textarea__textarea'
        ].join(',');

        function ensureStyle() {
            if (styleElement) return;

            styleElement = document.createElement('style');
            styleElement.id = 'deepseek-textarea-rtl-style';
            styleElement.textContent = css;

            (document.head || document.documentElement).appendChild(styleElement);
        }

        function isComposerMirrorOrContainer(el) {
            if (!(el instanceof Element)) {
                return false;
            }

            if (
                el.matches(composerElementSelector) ||
                el.closest('.ds-textarea, .ds-textarea__mirror')
            ) {
                return true;
            }

            let current = el;

            for (let depth = 0; current && depth < 4; depth += 1) {
                if (
                    current.querySelector &&
                    current.querySelector(`:scope > ${directTextareaSelector}`)
                ) {
                    return true;
                }

                current = current.parentElement;
            }

            return false;
        }

        function isRtlText(text) {
            const matches = text.match(rtlRegex);

            return matches &&
                matches.length >= config.minRtlChars;
        }

        function shouldIgnore(el) {
            return (
                !el ||
                el.nodeType !== Node.ELEMENT_NODE ||
                config.ignoredTags.has(el.tagName) ||
                el.getAttribute('dir') === 'ltr' ||
                el.closest('pre, code') !== null ||
                isComposerMirrorOrContainer(el)
            );
        }

        function applyRtlStyle(el, styledThisPass) {
            if (
                !el ||
                shouldIgnore(el) ||
                styledThisPass.has(el)
            ) {
                return;
            }

            styledThisPass.add(el);

            if (
                el.getAttribute('data-rtl-processed') === 'true' &&
                el.style.direction === 'rtl' &&
                el.style.textAlign === 'right'
            ) {
                return;
            }

            el.style.direction = 'rtl';
            el.style.textAlign = 'right';

            el.setAttribute(
                'data-rtl-processed',
                'true'
            );
        }

        function styleEl(el, styledThisPass) {
            if (!el || shouldIgnore(el)) return;

            applyRtlStyle(
                el,
                styledThisPass
            );

            let parent = el.parentElement;

            while (parent) {
                if (
                    config.importantTags.has(parent.tagName) &&
                    !shouldIgnore(parent)
                ) {
                    applyRtlStyle(
                        parent,
                        styledThisPass
                    );
                }

                parent = parent.parentElement;
            }
        }

        function getProcessRootFromNode(node) {
            const element =
                node instanceof Element
                    ? node
                    : node?.parentElement;

            if (!(element instanceof Element)) {
                return null;
            }

            if (shouldIgnore(element)) {
                return null;
            }

            if (element === document.body) {
                return element;
            }

            const block =
                element.closest(textRootSelector);

            if (
                block &&
                block !== document.body &&
                !shouldIgnore(block)
            ) {
                return block;
            }

            return element;
        }

        function process(root) {
            const processRoot =
                getProcessRootFromNode(root);

            if (!processRoot) return;

            const styledThisPass =
                new WeakSet();

            if (
                config.importantTags.has(processRoot.tagName) &&
                isRtlText(processRoot.textContent || '')
            ) {
                styleEl(
                    processRoot,
                    styledThisPass
                );
            }

            const walker = document.createTreeWalker(
                processRoot,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode(node) {
                        const value =
                            node.nodeValue;

                        if (
                            !value ||
                            !value.trim()
                        ) {
                            return NodeFilter.FILTER_REJECT;
                        }

                        const parent =
                            node.parentElement;

                        if (
                            !parent ||
                            parent.closest('pre, code') ||
                            isComposerMirrorOrContainer(parent)
                        ) {
                            return NodeFilter.FILTER_REJECT;
                        }

                        return isRtlText(value)
                            ? NodeFilter.FILTER_ACCEPT
                            : NodeFilter.FILTER_REJECT;
                    }
                }
            );

            let node;

            while ((node = walker.nextNode())) {
                if (node.parentElement) {
                    styleEl(
                        node.parentElement,
                        styledThisPass
                    );
                }
            }
        }

        function clear() {
            document
                .querySelectorAll('[data-rtl-processed="true"]')
                .forEach((el) => {
                    el.style.direction = '';
                    el.style.textAlign = '';

                    el.removeAttribute(
                        'data-rtl-processed'
                    );
                });
        }

        function pruneNestedRoots(roots) {
            return roots.filter((root) => {
                if (
                    !(root instanceof Element) ||
                    !root.isConnected
                ) {
                    return false;
                }

                return !roots.some(
                    (other) =>
                        other !== root &&
                        other instanceof Element &&
                        other.isConnected &&
                        other.contains(root)
                );
            });
        }

        function flushProcessQueue() {
            processFrame = 0;

            if (
                !isRTL ||
                !document.body ||
                pendingRoots.size === 0
            ) {
                pendingRoots.clear();
                return;
            }

            const roots =
                pruneNestedRoots(
                    Array.from(pendingRoots)
                );

            pendingRoots.clear();

            roots.forEach((root) => {
                process(root);
            });
        }

        function queueProcess(node) {
            if (!isRTL) return;

            const root =
                getProcessRootFromNode(node);

            if (!root) return;

            pendingRoots.add(root);

            if (!processFrame) {
                processFrame =
                    requestAnimationFrame(
                        flushProcessQueue
                    );
            }
        }

        function cancelQueuedProcessing() {
            pendingRoots.clear();

            if (processFrame) {
                cancelAnimationFrame(processFrame);
                processFrame = 0;
            }
        }

        function observe() {
            if (observer || !document.body) {
                return;
            }

            observer = new MutationObserver(
                (mutations) => {
                    for (const mutation of mutations) {
                        if (mutation.type === 'childList') {
                            mutation.addedNodes.forEach(
                                (node) => {
                                    if (
                                        node.nodeType ===
                                        Node.ELEMENT_NODE
                                    ) {
                                        queueProcess(node);
                                    } else if (
                                        node.nodeType ===
                                        Node.TEXT_NODE
                                    ) {
                                        queueProcess(
                                            node.parentElement
                                        );
                                    }
                                }
                            );
                        } else if (
                            mutation.type === 'characterData'
                        ) {
                            queueProcess(
                                mutation.target.parentElement
                            );
                        }
                    }
                }
            );

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true
            });
        }

        function apply() {
            ensureStyle();

            if (!document.body) return;

            if (isRTL) {
                document.body.setAttribute('data-deepseek-rtl', 'true');

                if (!initialProcessed) {
                    process(document.body);
                    initialProcessed = true;
                }

                observe();
            } else {
                document.body.removeAttribute('data-deepseek-rtl');

                if (observer) {
                    observer.disconnect();
                    observer = null;
                }

                cancelQueuedProcessing();

                initialProcessed = false;

                clear();
            }
        }

        return { apply };
    })();

    /* ======================== CHATGPT STRATEGY ============================ */
    const chatgpt = (() => {
        let baseStyle = null;
        let handlersInstalled = false;
        let nextEditorKey = 1;
        let pendingEditors = new WeakSet();

        const editorStates = new Map();

        const normalEditorSelector = [
            'form[data-type="unified-composer"] #prompt-textarea[contenteditable="true"]',
            'form[data-type="unified-composer"] [contenteditable="true"][role="textbox"][aria-multiline="true"]',
            '[data-composer-surface="true"] #prompt-textarea[contenteditable="true"]',
            '[data-composer-surface="true"] [contenteditable="true"][role="textbox"][aria-multiline="true"]',
            '#prompt-textarea.ProseMirror[contenteditable="true"]'
        ].join(',');

        const rtlCharacterRegex =
            /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

        const englishCharacterRegex =
            /[A-Za-z]/;

        const css = `
            /* Normal ChatGPT composer. */
            [data-chatgpt-rtl="true"] form[data-type="unified-composer"] #prompt-textarea[contenteditable="true"],
            [data-chatgpt-rtl="true"] form[data-type="unified-composer"] [contenteditable="true"][role="textbox"][aria-multiline="true"],
            [data-chatgpt-rtl="true"] [data-composer-surface="true"] #prompt-textarea[contenteditable="true"],
            [data-chatgpt-rtl="true"] [data-composer-surface="true"] [contenteditable="true"][role="textbox"][aria-multiline="true"],
            [data-chatgpt-rtl="true"] #prompt-textarea.ProseMirror[contenteditable="true"] {
                direction: rtl !important;
                text-align: right !important;
            }

            [data-chatgpt-rtl="true"] form[data-type="unified-composer"] #prompt-textarea[contenteditable="true"] > *,
            [data-chatgpt-rtl="true"] form[data-type="unified-composer"] [contenteditable="true"][role="textbox"][aria-multiline="true"] > *,
            [data-chatgpt-rtl="true"] [data-composer-surface="true"] #prompt-textarea[contenteditable="true"] > *,
            [data-chatgpt-rtl="true"] [data-composer-surface="true"] [contenteditable="true"][role="textbox"][aria-multiline="true"] > *,
            [data-chatgpt-rtl="true"] #prompt-textarea.ProseMirror[contenteditable="true"] > * {
                direction: rtl !important;
                text-align: start !important;
                unicode-bidi: plaintext !important;
            }

            [data-chatgpt-rtl="true"] #prompt-textarea.ProseMirror[contenteditable="true"] > ul > li,
            [data-chatgpt-rtl="true"] #prompt-textarea.ProseMirror[contenteditable="true"] > ol > li {
                direction: rtl !important;
                text-align: start !important;
                unicode-bidi: plaintext !important;
            }

            [data-chatgpt-rtl="true"] form[data-type="unified-composer"] textarea[name="prompt-textarea"],
            [data-chatgpt-rtl="true"] [data-composer-surface="true"] textarea[name="prompt-textarea"] {
                direction: rtl !important;
                text-align: start !important;
                unicode-bidi: plaintext !important;
            }

            [data-chatgpt-rtl="true"] textarea[aria-label="Edit message"],
            [data-chatgpt-rtl="true"] section[data-turn="user"] textarea:not([name="prompt-textarea"]),
            [data-chatgpt-rtl="true"] [data-testid^="conversation-turn-"][data-turn="user"] textarea:not([name="prompt-textarea"]) {
                direction: rtl !important;
                text-align: start !important;
                unicode-bidi: plaintext !important;
            }

            [data-chatgpt-rtl="true"] [data-message-author-role="user"] [data-testid="collapsible-user-message-content"] > div[class*="whitespace-pre-wrap"] {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: isolate !important;
            }

            [data-chatgpt-rtl="true"] [data-message-author-role="user"] .user-message-bubble-color {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: isolate !important;
            }

            [data-chatgpt-rtl="true"] [data-message-author-role="user"] [role="group"][aria-label] {
                direction: ltr !important;
                text-align: left !important;
                unicode-bidi: isolate !important;
            }

            [data-chatgpt-rtl="true"] textarea[name="prompt-textarea"]::placeholder,
            [data-chatgpt-rtl="true"] #prompt-textarea.ProseMirror[contenteditable="true"] > [data-placeholder] {
                direction: rtl !important;
                text-align: right !important;
            }
        `;

        function ensureBaseStyle() {
            if (baseStyle) return;

            baseStyle = document.createElement('style');
            baseStyle.id = 'chatgpt-composer-rtl-style';
            baseStyle.textContent = css;

            (document.head || document.documentElement)
                .appendChild(baseStyle);
        }

        function isMixedLine(text) {
            const value = text || '';

            return (
                rtlCharacterRegex.test(value) &&
                englishCharacterRegex.test(value)
            );
        }

        function setsEqual(a, b) {
            if (a.size !== b.size) {
                return false;
            }

            for (const value of a) {
                if (!b.has(value)) {
                    return false;
                }
            }

            return true;
        }

        function renderMixedOverrides(state) {
            state.styleElement.textContent =
                Array.from(state.mixedIndexes)
                    .sort((a, b) => a - b)
                    .map((index) => `
                        [data-chatgpt-rtl="true"]
                        [data-ai-rtl-editor-key="${state.key}"]
                        > :nth-child(${index + 1}) {
                            direction: rtl !important;
                            text-align: right !important;
                            unicode-bidi: plaintext !important;
                        }
                    `)
                    .join('\n');
        }

        function pruneDisconnectedEditors() {
            for (const [editor, state] of editorStates) {
                if (editor.isConnected) {
                    continue;
                }

                state.styleElement.remove();
                editorStates.delete(editor);
            }
        }

        function scanAllLines(editor, state) {
            const nextMixedIndexes =
                new Set();

            const children =
                Array.from(editor.children);

            children.forEach((block, index) => {
                if (isMixedLine(block.textContent)) {
                    nextMixedIndexes.add(index);
                }
            });

            state.childCount =
                children.length;

            if (
                !setsEqual(
                    state.mixedIndexes,
                    nextMixedIndexes
                )
            ) {
                state.mixedIndexes =
                    nextMixedIndexes;

                renderMixedOverrides(state);
            }
        }

        function ensureEditorState(editor) {
            pruneDisconnectedEditors();

            let state =
                editorStates.get(editor);

            if (state) {
                if (
                    editor.getAttribute(
                        'data-ai-rtl-editor-key'
                    ) !== state.key
                ) {
                    editor.setAttribute(
                        'data-ai-rtl-editor-key',
                        state.key
                    );
                }

                return state;
            }

            const key =
                `chatgpt-rtl-${nextEditorKey++}`;

            const styleElement =
                document.createElement('style');

            styleElement.setAttribute(
                'data-ai-rtl-line-overrides',
                key
            );

            (document.head || document.documentElement)
                .appendChild(styleElement);

            state = {
                key,
                styleElement,
                childCount: -1,
                mixedIndexes: new Set()
            };

            editor.setAttribute(
                'data-ai-rtl-editor-key',
                key
            );

            editorStates.set(
                editor,
                state
            );

            scanAllLines(
                editor,
                state
            );

            return state;
        }

        function getTopLevelBlock(editor) {
            const selection =
                window.getSelection();

            if (
                !selection ||
                !selection.anchorNode
            ) {
                return null;
            }

            let element =
                selection.anchorNode.nodeType ===
                Node.ELEMENT_NODE
                    ? selection.anchorNode
                    : selection.anchorNode.parentElement;

            if (
                !(element instanceof Element) ||
                !editor.contains(element)
            ) {
                return null;
            }

            while (
                element &&
                element.parentElement !== editor
            ) {
                element =
                    element.parentElement;
            }

            return (
                element &&
                element.parentElement === editor
            )
                ? element
                : null;
        }

        function syncActiveLine(editor) {
            if (
                !isRTL ||
                !editor.isConnected
            ) {
                return;
            }

            const state =
                ensureEditorState(editor);

            if (
                editor.children.length !==
                state.childCount
            ) {
                scanAllLines(
                    editor,
                    state
                );

                return;
            }

            const block =
                getTopLevelBlock(editor);

            if (!block) {
                return;
            }

            const index =
                Array.prototype.indexOf.call(
                    editor.children,
                    block
                );

            if (index < 0) {
                return;
            }

            const mixed =
                isMixedLine(block.textContent);

            const wasMixed =
                state.mixedIndexes.has(index);

            if (mixed === wasMixed) {
                return;
            }

            if (mixed) {
                state.mixedIndexes.add(index);
            } else {
                state.mixedIndexes.delete(index);
            }

            renderMixedOverrides(state);
        }

        function scheduleSync(editor) {
            if (
                !(editor instanceof Element) ||
                pendingEditors.has(editor)
            ) {
                return;
            }

            pendingEditors.add(editor);

            requestAnimationFrame(() => {
                pendingEditors.delete(editor);
                syncActiveLine(editor);
            });
        }

        function findNormalEditor(node) {
            const element =
                node instanceof Element
                    ? node
                    : node?.parentElement;

            if (!(element instanceof Element)) {
                return null;
            }

            if (
                element.matches(
                    normalEditorSelector
                )
            ) {
                return element;
            }

            const editor =
                element.closest(
                    '[contenteditable="true"]'
                );

            return editor?.matches(
                normalEditorSelector
            )
                ? editor
                : null;
        }

        function onFocusIn(event) {
            if (!isRTL) return;

            const editor =
                findNormalEditor(event.target);

            if (editor) {
                ensureEditorState(editor);
            }
        }

        function onInput(event) {
            if (!isRTL) return;

            const editor =
                findNormalEditor(event.target);

            if (editor) {
                scheduleSync(editor);
            }
        }

        function installHandlers() {
            if (handlersInstalled) {
                return;
            }

            document.addEventListener(
                'focusin',
                onFocusIn,
                true
            );

            document.addEventListener(
                'input',
                onInput,
                true
            );

            document.addEventListener(
                'compositionend',
                onInput,
                true
            );

            handlersInstalled = true;
        }

        function removeHandlers() {
            if (!handlersInstalled) {
                return;
            }

            document.removeEventListener(
                'focusin',
                onFocusIn,
                true
            );

            document.removeEventListener(
                'input',
                onInput,
                true
            );

            document.removeEventListener(
                'compositionend',
                onInput,
                true
            );

            handlersInstalled = false;
        }

        function initializeVisibleEditors() {
            document
                .querySelectorAll(
                    normalEditorSelector
                )
                .forEach((editor) => {
                    ensureEditorState(editor);
                });
        }

        function clearEditorStates() {
            for (const [editor, state] of editorStates) {
                editor.removeAttribute(
                    'data-ai-rtl-editor-key'
                );

                state.styleElement.remove();
            }

            editorStates.clear();
            pendingEditors = new WeakSet();
        }

        function apply() {
            ensureBaseStyle();

            if (!document.body) {
                return;
            }

            if (isRTL) {
                document.body.setAttribute(
                    'data-chatgpt-rtl',
                    'true'
                );

                installHandlers();
                initializeVisibleEditors();
            } else {
                document.body.removeAttribute(
                    'data-chatgpt-rtl'
                );

                removeHandlers();
                clearEditorStates();
            }
        }

        return { apply };
    })();

    /* ======================== GEMINI STRATEGY ============================= */
    const gemini = (() => {
        let styleElement = null;
        let handlersInstalled = false;
        let nextEditorKey = 1;
        let pendingEditors = new WeakSet();

        const editorStates = new Map();

        const editorSelector = [
            'rich-textarea .ql-editor[contenteditable="true"][role="textbox"][aria-multiline="true"]',
            '.text-input-field_textarea .ql-editor[contenteditable="true"][role="textbox"]',
            '.ql-editor.textarea[contenteditable="true"][role="textbox"]',
            '[data-test-id="textarea-wrapper"] .ql-editor[contenteditable="true"][role="textbox"]',
            '[contenteditable="true"][role="textbox"][aria-label*="Gemini"]',
            '[contenteditable="true"][role="textbox"][aria-multiline="true"].ql-editor'
        ].join(',');

        const rtlCharacterRegex =
            /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

        const englishCharacterRegex =
            /[A-Za-z]/;

        const invisibleCharactersRegex =
            /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

        const css = `
            /*
             * Gemini composer / edit text boxes.
             * Gemini uses rich-textarea + .ql-editor with one <p> per line,
             * so this mirrors the ChatGPT/Claude per-line behavior.
             */
            [data-gemini-rtl="true"] rich-textarea,
            [data-gemini-rtl="true"] .text-input-field_textarea {
                direction: rtl !important;
            }

            [data-gemini-rtl="true"] rich-textarea .ql-editor[contenteditable="true"][role="textbox"],
            [data-gemini-rtl="true"] .text-input-field_textarea .ql-editor[contenteditable="true"][role="textbox"],
            [data-gemini-rtl="true"] .ql-editor.textarea[contenteditable="true"][role="textbox"],
            [data-gemini-rtl="true"] [data-test-id="textarea-wrapper"] .ql-editor[contenteditable="true"][role="textbox"],
            [data-gemini-rtl="true"] [contenteditable="true"][role="textbox"][aria-label*="Gemini"] {
                direction: rtl !important;
                text-align: right !important;
            }

            [data-gemini-rtl="true"] rich-textarea .ql-editor[contenteditable="true"][role="textbox"] > *,
            [data-gemini-rtl="true"] .text-input-field_textarea .ql-editor[contenteditable="true"][role="textbox"] > *,
            [data-gemini-rtl="true"] .ql-editor.textarea[contenteditable="true"][role="textbox"] > *,
            [data-gemini-rtl="true"] [data-test-id="textarea-wrapper"] .ql-editor[contenteditable="true"][role="textbox"] > *,
            [data-gemini-rtl="true"] [contenteditable="true"][role="textbox"][aria-label*="Gemini"] > * {
                direction: rtl !important;
                text-align: start !important;
                unicode-bidi: plaintext !important;
            }

            /*
             * Empty Gemini lines.
             * Every new empty line defaults to RTL/right until real text is typed.
             */
            [data-gemini-rtl="true"] [data-ai-gemini-rtl-empty-line="true"],
            [data-gemini-rtl="true"] rich-textarea .ql-editor[contenteditable="true"][role="textbox"].ql-blank,
            [data-gemini-rtl="true"] .text-input-field_textarea .ql-editor[contenteditable="true"][role="textbox"].ql-blank,
            [data-gemini-rtl="true"] .ql-editor.textarea[contenteditable="true"][role="textbox"].ql-blank,
            [data-gemini-rtl="true"] [data-test-id="textarea-wrapper"] .ql-editor[contenteditable="true"][role="textbox"].ql-blank,
            [data-gemini-rtl="true"] rich-textarea .ql-editor[contenteditable="true"][role="textbox"] > p:empty,
            [data-gemini-rtl="true"] rich-textarea .ql-editor[contenteditable="true"][role="textbox"] > p:has(> br:only-child),
            [data-gemini-rtl="true"] .text-input-field_textarea .ql-editor[contenteditable="true"][role="textbox"] > p:empty,
            [data-gemini-rtl="true"] .text-input-field_textarea .ql-editor[contenteditable="true"][role="textbox"] > p:has(> br:only-child),
            [data-gemini-rtl="true"] .ql-editor.textarea[contenteditable="true"][role="textbox"] > p:empty,
            [data-gemini-rtl="true"] .ql-editor.textarea[contenteditable="true"][role="textbox"] > p:has(> br:only-child),
            [data-gemini-rtl="true"] [data-test-id="textarea-wrapper"] .ql-editor[contenteditable="true"][role="textbox"] > p:empty,
            [data-gemini-rtl="true"] [data-test-id="textarea-wrapper"] .ql-editor[contenteditable="true"][role="textbox"] > p:has(> br:only-child) {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: isolate !important;
            }

            [data-gemini-rtl="true"] rich-textarea .ql-editor[contenteditable="true"][role="textbox"] > ul > li,
            [data-gemini-rtl="true"] rich-textarea .ql-editor[contenteditable="true"][role="textbox"] > ol > li,
            [data-gemini-rtl="true"] .ql-editor.textarea[contenteditable="true"][role="textbox"] > ul > li,
            [data-gemini-rtl="true"] .ql-editor.textarea[contenteditable="true"][role="textbox"] > ol > li {
                direction: rtl !important;
                text-align: start !important;
                unicode-bidi: plaintext !important;
            }

            [data-gemini-rtl="true"] textarea[aria-label*="Gemini"],
            [data-gemini-rtl="true"] textarea[aria-label*="עריכה"],
            [data-gemini-rtl="true"] textarea[aria-label*="בקשה"],
            [data-gemini-rtl="true"] textarea[aria-label*="הנחיה"] {
                direction: rtl !important;
                text-align: start !important;
                unicode-bidi: plaintext !important;
            }

            [data-gemini-rtl="true"] textarea[aria-label*="Gemini"]:placeholder-shown,
            [data-gemini-rtl="true"] textarea[aria-label*="עריכה"]:placeholder-shown,
            [data-gemini-rtl="true"] textarea[aria-label*="בקשה"]:placeholder-shown,
            [data-gemini-rtl="true"] textarea[aria-label*="הנחיה"]:placeholder-shown {
                direction: rtl !important;
                text-align: right !important;
            }

            [data-gemini-rtl="true"] textarea[aria-label*="Gemini"]::placeholder,
            [data-gemini-rtl="true"] textarea[aria-label*="עריכה"]::placeholder,
            [data-gemini-rtl="true"] textarea[aria-label*="בקשה"]::placeholder,
            [data-gemini-rtl="true"] textarea[aria-label*="הנחיה"]::placeholder,
            [data-gemini-rtl="true"] rich-textarea .ql-editor[contenteditable="true"][role="textbox"][data-placeholder]::before,
            [data-gemini-rtl="true"] .ql-editor.textarea[contenteditable="true"][role="textbox"][data-placeholder]::before {
                direction: rtl !important;
                text-align: right !important;
            }

            /*
             * Gemini fullscreen / expand button.
             * When the input grows to multiple lines, Gemini can place this
             * button over the first text line. Give the expanded field a small
             * top buffer, then lift the button into that buffer. Only the actual
             * controls remain clickable, not the whole wrapper.
             */
            [data-gemini-rtl="true"] input-area-v2 .input-area:has(.text-input-field.height-expanded-past-single-line) {
                overflow: visible !important;
            }

            [data-gemini-rtl="true"] input-area-v2 .input-area:has(.text-input-field.height-expanded-past-single-line) .text-input-field.height-expanded-past-single-line {
                box-sizing: border-box !important;
                padding-top: 30px !important;
                overflow: visible !important;
            }

            [data-gemini-rtl="true"] input-area-v2 .input-area:has(.text-input-field.height-expanded-past-single-line) .input-buttons-wrapper-top {
                transform: translateY(-12px) !important;
                pointer-events: none !important;
                z-index: 5 !important;
            }

            [data-gemini-rtl="true"] input-area-v2 .input-area:has(.text-input-field.height-expanded-past-single-line) .input-buttons-wrapper-top :is(
                button,
                [role="button"],
                .fullscreen-button-container,
                .fullscreen-button
            ) {
                pointer-events: auto !important;
            }

            /*
             * Gemini response display only.
             * Forces regular answer text to RTL while keeping code blocks LTR.
             */
            [data-gemini-rtl="true"] message-content .markdown.markdown-main-panel[id^="model-response-message-content"],
            [data-gemini-rtl="true"] .model-response-text message-content .markdown.markdown-main-panel,
            [data-gemini-rtl="true"] [id^="model-response-message-content"].markdown.markdown-main-panel {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: isolate !important;
            }

            [data-gemini-rtl="true"] message-content .markdown.markdown-main-panel[id^="model-response-message-content"] :is(
                p,
                h1,
                h2,
                h3,
                h4,
                h5,
                h6,
                li,
                blockquote,
                table,
                th,
                td
            ),
            [data-gemini-rtl="true"] .model-response-text message-content .markdown.markdown-main-panel :is(
                p,
                h1,
                h2,
                h3,
                h4,
                h5,
                h6,
                li,
                blockquote,
                table,
                th,
                td
            ),
            [data-gemini-rtl="true"] [id^="model-response-message-content"].markdown.markdown-main-panel :is(
                p,
                h1,
                h2,
                h3,
                h4,
                h5,
                h6,
                li,
                blockquote,
                table,
                th,
                td
            ) {
                direction: rtl !important;
                text-align: right !important;
                unicode-bidi: isolate !important;
            }

            [data-gemini-rtl="true"] message-content .markdown.markdown-main-panel[id^="model-response-message-content"] :is(
                ul,
                ol
            ),
            [data-gemini-rtl="true"] .model-response-text message-content .markdown.markdown-main-panel :is(
                ul,
                ol
            ),
            [data-gemini-rtl="true"] [id^="model-response-message-content"].markdown.markdown-main-panel :is(
                ul,
                ol
            ) {
                direction: rtl !important;
                text-align: right !important;
                padding-right: 1.5em !important;
                padding-left: 0 !important;
            }

            [data-gemini-rtl="true"] message-content .markdown.markdown-main-panel[id^="model-response-message-content"] :is(
                p,
                li,
                h1,
                h2,
                h3,
                h4,
                h5,
                h6,
                td,
                th
            ) code,
            [data-gemini-rtl="true"] .model-response-text message-content .markdown.markdown-main-panel :is(
                p,
                li,
                h1,
                h2,
                h3,
                h4,
                h5,
                h6,
                td,
                th
            ) code,
            [data-gemini-rtl="true"] [id^="model-response-message-content"].markdown.markdown-main-panel :is(
                p,
                li,
                h1,
                h2,
                h3,
                h4,
                h5,
                h6,
                td,
                th
            ) code {
                direction: ltr !important;
                text-align: left !important;
                unicode-bidi: isolate !important;
            }

            [data-gemini-rtl="true"] message-content .markdown.markdown-main-panel[id^="model-response-message-content"] :is(
                code-block,
                bard-code-block,
                .code-block,
                .formatted-code-block-internal-container,
                pre,
                pre code,
                [class*="code-block"],
                [class*="CodeBlock"]
            ),
            [data-gemini-rtl="true"] .model-response-text message-content .markdown.markdown-main-panel :is(
                code-block,
                bard-code-block,
                .code-block,
                .formatted-code-block-internal-container,
                pre,
                pre code,
                [class*="code-block"],
                [class*="CodeBlock"]
            ),
            [data-gemini-rtl="true"] [id^="model-response-message-content"].markdown.markdown-main-panel :is(
                code-block,
                bard-code-block,
                .code-block,
                .formatted-code-block-internal-container,
                pre,
                pre code,
                [class*="code-block"],
                [class*="CodeBlock"]
            ) {
                direction: ltr !important;
                text-align: left !important;
                unicode-bidi: isolate !important;
            }
        `;

        function ensureStyle() {
            if (styleElement) return;

            styleElement = document.createElement('style');
            styleElement.id = 'gemini-rtl-style';
            styleElement.textContent = css;

            (document.head || document.documentElement).appendChild(styleElement);
        }

        function isMixedLine(text) {
            const value = text || '';

            return (
                rtlCharacterRegex.test(value) &&
                englishCharacterRegex.test(value)
            );
        }

        function isEmptyLine(block) {
            const text =
                (block?.textContent || '')
                    .replace(invisibleCharactersRegex, '')
                    .trim();

            return text.length === 0;
        }

        function syncEmptyLine(block) {
            if (!(block instanceof Element)) {
                return;
            }

            if (isEmptyLine(block)) {
                block.setAttribute(
                    'data-ai-gemini-rtl-empty-line',
                    'true'
                );
            } else {
                block.removeAttribute(
                    'data-ai-gemini-rtl-empty-line'
                );
            }
        }

        function setsEqual(a, b) {
            if (a.size !== b.size) {
                return false;
            }

            for (const value of a) {
                if (!b.has(value)) {
                    return false;
                }
            }

            return true;
        }

        function renderMixedOverrides(state) {
            state.styleElement.textContent =
                Array.from(state.mixedIndexes)
                    .sort((a, b) => a - b)
                    .map((index) => `
                        [data-gemini-rtl="true"]
                        [data-ai-gemini-rtl-editor-key="${state.key}"]
                        > :nth-child(${index + 1}) {
                            direction: rtl !important;
                            text-align: right !important;
                            unicode-bidi: plaintext !important;
                        }
                    `)
                    .join('\n');
        }

        function pruneDisconnectedEditors() {
            for (const [editor, state] of editorStates) {
                if (editor.isConnected) {
                    continue;
                }

                state.styleElement.remove();
                editorStates.delete(editor);
            }
        }

        function scanAllLines(editor, state) {
            const nextMixedIndexes =
                new Set();

            const children =
                Array.from(editor.children);

            children.forEach((block, index) => {
                syncEmptyLine(block);

                if (isMixedLine(block.textContent)) {
                    nextMixedIndexes.add(index);
                }
            });

            state.childCount =
                children.length;

            if (
                !setsEqual(
                    state.mixedIndexes,
                    nextMixedIndexes
                )
            ) {
                state.mixedIndexes =
                    nextMixedIndexes;

                renderMixedOverrides(state);
            }
        }

        function ensureEditorState(editor) {
            pruneDisconnectedEditors();

            let state =
                editorStates.get(editor);

            if (state) {
                if (
                    editor.getAttribute(
                        'data-ai-gemini-rtl-editor-key'
                    ) !== state.key
                ) {
                    editor.setAttribute(
                        'data-ai-gemini-rtl-editor-key',
                        state.key
                    );
                }

                return state;
            }

            const key =
                `gemini-rtl-${nextEditorKey++}`;

            const lineStyleElement =
                document.createElement('style');

            lineStyleElement.setAttribute(
                'data-ai-gemini-rtl-line-overrides',
                key
            );

            (document.head || document.documentElement)
                .appendChild(lineStyleElement);

            state = {
                key,
                styleElement: lineStyleElement,
                childCount: -1,
                mixedIndexes: new Set()
            };

            editor.setAttribute(
                'data-ai-gemini-rtl-editor-key',
                key
            );

            editorStates.set(
                editor,
                state
            );

            scanAllLines(
                editor,
                state
            );

            return state;
        }

        function getTopLevelBlock(editor) {
            const selection =
                window.getSelection();

            if (
                !selection ||
                !selection.anchorNode
            ) {
                return null;
            }

            let element =
                selection.anchorNode.nodeType ===
                Node.ELEMENT_NODE
                    ? selection.anchorNode
                    : selection.anchorNode.parentElement;

            if (
                !(element instanceof Element) ||
                !editor.contains(element)
            ) {
                return null;
            }

            while (
                element &&
                element.parentElement !== editor
            ) {
                element =
                    element.parentElement;
            }

            return (
                element &&
                element.parentElement === editor
            )
                ? element
                : null;
        }

        function syncActiveLine(editor) {
            if (
                !isRTL ||
                !editor.isConnected
            ) {
                return;
            }

            const state =
                ensureEditorState(editor);

            if (
                editor.children.length !==
                state.childCount
            ) {
                scanAllLines(
                    editor,
                    state
                );

                return;
            }

            const block =
                getTopLevelBlock(editor);

            if (!block) {
                return;
            }

            syncEmptyLine(block);

            const index =
                Array.prototype.indexOf.call(
                    editor.children,
                    block
                );

            if (index < 0) {
                return;
            }

            const mixed =
                isMixedLine(block.textContent);

            const wasMixed =
                state.mixedIndexes.has(index);

            if (mixed === wasMixed) {
                return;
            }

            if (mixed) {
                state.mixedIndexes.add(index);
            } else {
                state.mixedIndexes.delete(index);
            }

            renderMixedOverrides(state);
        }

        function scheduleSync(editor) {
            if (
                !(editor instanceof Element) ||
                pendingEditors.has(editor)
            ) {
                return;
            }

            pendingEditors.add(editor);

            requestAnimationFrame(() => {
                pendingEditors.delete(editor);
                syncActiveLine(editor);
            });
        }

        function findEditor(node) {
            const element =
                node instanceof Element
                    ? node
                    : node?.parentElement;

            if (!(element instanceof Element)) {
                return null;
            }

            if (
                element.matches(
                    editorSelector
                )
            ) {
                return element;
            }

            const editor =
                element.closest(
                    '[contenteditable="true"]'
                );

            return editor?.matches(
                editorSelector
            )
                ? editor
                : null;
        }

        function onFocusIn(event) {
            if (!isRTL) return;

            const editor =
                findEditor(event.target);

            if (editor) {
                ensureEditorState(editor);
            }
        }

        function onInput(event) {
            if (!isRTL) return;

            const editor =
                findEditor(event.target);

            if (editor) {
                scheduleSync(editor);
            }
        }

        function installHandlers() {
            if (handlersInstalled) {
                return;
            }

            document.addEventListener(
                'focusin',
                onFocusIn,
                true
            );

            document.addEventListener(
                'input',
                onInput,
                true
            );

            document.addEventListener(
                'compositionend',
                onInput,
                true
            );

            handlersInstalled = true;
        }

        function removeHandlers() {
            if (!handlersInstalled) {
                return;
            }

            document.removeEventListener(
                'focusin',
                onFocusIn,
                true
            );

            document.removeEventListener(
                'input',
                onInput,
                true
            );

            document.removeEventListener(
                'compositionend',
                onInput,
                true
            );

            handlersInstalled = false;
        }

        function initializeVisibleEditors() {
            document
                .querySelectorAll(
                    editorSelector
                )
                .forEach((editor) => {
                    ensureEditorState(editor);
                });
        }

        function clearEditorStates() {
            for (const [editor, state] of editorStates) {
                editor.removeAttribute(
                    'data-ai-gemini-rtl-editor-key'
                );

                editor
                    .querySelectorAll('[data-ai-gemini-rtl-empty-line="true"]')
                    .forEach((block) => {
                        block.removeAttribute(
                            'data-ai-gemini-rtl-empty-line'
                        );
                    });

                state.styleElement.remove();
            }

            editorStates.clear();
            pendingEditors = new WeakSet();
        }

        function apply() {
            ensureStyle();

            if (!document.body) return;

            if (isRTL) {
                document.body.setAttribute('data-gemini-rtl', 'true');

                installHandlers();
                initializeVisibleEditors();
            } else {
                document.body.removeAttribute('data-gemini-rtl');

                removeHandlers();
                clearEditorStates();
            }
        }

        return { apply };
    })();

    /* ============================ SHARED ================================== */
    const active =
        SITE === 'claude'
            ? claude
            : SITE === 'deepseek'
                ? deepseek
                : SITE === 'chatgpt'
                    ? chatgpt
                    : SITE === 'gemini'
                        ? gemini
                        : null;

    function apply() {
        if (active) {
            active.apply();
        }
    }

    function toggleRTL() {
        isRTL = !isRTL;

        GM_setValue(
            'isRTL',
            isRTL
        );

        apply();
    }

    GM_registerMenuCommand(
        'הפעל/כבה תצוגת ימין לשמאל',
        toggleRTL
    );

    document.addEventListener(
        'keydown',
        (event) => {
            if (
                event.ctrlKey &&
                event.shiftKey &&
                (
                    event.key === 'R' ||
                    event.key === 'r'
                )
            ) {
                event.preventDefault();
                toggleRTL();
            }
        }
    );

    if (document.body) {
        apply();
    } else {
        document.addEventListener(
            'DOMContentLoaded',
            apply,
            { once: true }
        );
    }
})();