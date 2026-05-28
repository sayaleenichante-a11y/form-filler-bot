(function () {
    const oldBot = document.getElementById("smart-form-bot");

    if (oldBot) {
        oldBot.remove();
    }

    if (document.getElementById("smart-ai-form-bot")) {
        return;
    }

    console.log("Smart AI Form Bot v3 loaded");

    let currentFields = [];
    let lastMatches = [];

    const bot = document.createElement("div");
    bot.id = "smart-ai-form-bot";

    bot.innerHTML = `
        <div class="bot-header">
            <span>🤖 Smart Form Bot</span>
            <button id="bot-toggle">−</button>
        </div>

        <div id="bot-body">
            <p class="bot-small">
                Upload any file. Bot scans current website form and fills matched fields.
            </p>

            <input type="file" id="bot-file"
                accept=".pdf,.docx,.txt,.xlsx,.xls,.csv,.pptx,.rtf,.html,.json,.png,.jpg,.jpeg,.webp,.bmp,.tiff" />

            <button id="bot-scan-btn">Scan Form</button>
            <button id="bot-fill-btn">Extract & Fill</button>

            <div id="bot-status">Ready</div>
            <div id="bot-result"></div>
        </div>
    `;

    document.body.appendChild(bot);

    const body = document.getElementById("bot-body");
    const toggleBtn = document.getElementById("bot-toggle");
    const statusBox = document.getElementById("bot-status");
    const resultBox = document.getElementById("bot-result");

    toggleBtn.addEventListener("click", () => {
        if (body.style.display === "none") {
            body.style.display = "block";
            toggleBtn.innerText = "−";
        } else {
            body.style.display = "none";
            toggleBtn.innerText = "+";
        }
    });

    document.getElementById("bot-scan-btn").addEventListener("click", () => {
        currentFields = collectFormFields();

        statusBox.innerText = `Found ${currentFields.length} fillable fields`;

        resultBox.innerHTML = currentFields
            .slice(0, 20)
            .map(f => `
                <div class="bot-field">
                    #${f.index}: ${escapeHtml(
                f.label ||
                f.name ||
                f.placeholder ||
                f.id ||
                f.nearText ||
                f.type
            )}
                </div>
            `)
            .join("");
    });

    document.getElementById("bot-fill-btn").addEventListener("click", async () => {
        const fileInput = document.getElementById("bot-file");

        if (!fileInput.files.length) {
            statusBox.innerText = "Please upload a file first";
            return;
        }

        const file = fileInput.files[0];

        currentFields = collectFormFields();

        if (!currentFields.length) {
            statusBox.innerText = "No fillable fields found on this page";
            return;
        }

        statusBox.innerText = "Extracting and matching fields...";
        resultBox.innerHTML = "";

        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("fields", JSON.stringify(currentFields.map(stripElement)));

            const response = await fetch("http://127.0.0.1:5050/extract-smart", {
                method: "POST",
                body: formData
            });

            const result = await response.json();

            console.log("Smart Form Bot result:", result);
            console.log("Extracted Entities:", result.entities);

            if (!result.success) {
                statusBox.innerText = result.error || "Extraction failed";
                return;
            }

            lastMatches = result.matches || [];

            const filledCount = fillMatchedFields(lastMatches);
            const fileUploadCount = fillFileInputs(file);

            statusBox.innerText = `Filled ${filledCount} fields successfully`;

            resultBox.innerHTML = `
                <div class="bot-success">Candidates found: ${result.candidate_count}</div>
                <div class="bot-success">Matched fields: ${lastMatches.length}</div>
                <div class="bot-success">Website file inputs updated: ${fileUploadCount}</div>

                <details>
                    <summary>View extracted data</summary>
                    <pre>${escapeHtml(JSON.stringify(result.entities || {}, null, 2))}</pre>
                </details>
            `;

        } catch (error) {
            console.error(error);
            statusBox.innerText = "Backend not running or error occurred";
        }
    });

    function collectFormFields() {
        const elements = getAllFormElements();
        const fields = [];

        elements.forEach((el) => {
            if (!isFillable(el)) return;

            const index = fields.length;

            fields.push({
                index,
                element: el,
                tag: el.tagName.toLowerCase(),
                type: (el.getAttribute("type") || "").toLowerCase(),
                name: el.getAttribute("name") || "",
                id: el.id || "",
                placeholder: el.getAttribute("placeholder") || "",
                ariaLabel: el.getAttribute("aria-label") || "",
                role: el.getAttribute("role") || "",
                autocomplete: el.getAttribute("autocomplete") || "",
                label: getLabelText(el),
                nearText: getNearbyText(el),
                options: getOptions(el)
            });
        });

        return fields;
    }

    function getAllFormElements() {
        const selectors = [
            "input",
            "textarea",
            "select",
            "[contenteditable='true']",
            "[role='textbox']"
        ];

        let elements = [];

        elements.push(...document.querySelectorAll(selectors.join(",")));

        document.querySelectorAll("*").forEach(node => {
            if (node.shadowRoot) {
                try {
                    elements.push(...node.shadowRoot.querySelectorAll(selectors.join(",")));
                } catch (error) {
                    console.warn("Cannot scan shadow root:", error);
                }
            }
        });

        document.querySelectorAll("iframe").forEach(frame => {
            try {
                const doc = frame.contentDocument || frame.contentWindow.document;

                if (doc) {
                    elements.push(...doc.querySelectorAll(selectors.join(",")));
                }
            } catch (error) {
                console.warn("Cannot access cross-origin iframe:", error);
            }
        });

        return [...new Set(elements)];
    }

    function isFillable(el) {
        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute("type") || "").toLowerCase();

        if (el.disabled || el.readOnly) return false;
        if (type === "hidden") return false;

        if (["submit", "button", "reset", "image", "password"].includes(type)) {
            return false;
        }

        if (tag === "input" && ["checkbox", "radio"].includes(type)) {
            return false;
        }

        const style = window.getComputedStyle(el);

        if (style.display === "none" || style.visibility === "hidden") {
            return false;
        }

        return true;
    }

    function getLabelText(el) {
        if (el.id) {
            const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);

            if (label) {
                return label.innerText.trim();
            }
        }

        const parentLabel = el.closest("label");

        if (parentLabel) {
            return parentLabel.innerText.trim();
        }

        const ariaLabelledBy = el.getAttribute("aria-labelledby");

        if (ariaLabelledBy) {
            const labelEl = document.getElementById(ariaLabelledBy);

            if (labelEl) {
                return labelEl.innerText.trim();
            }
        }

        return "";
    }

    function getNearbyText(el) {
        let text = "";

        const parent = el.closest(
            ".form-group, .field, .input-group, .row, .form-control, div, p, td, tr, section, article"
        );

        if (parent) {
            text = parent.innerText || "";
        }

        return text.trim().slice(0, 450);
    }

    function getOptions(el) {
        if (el.tagName.toLowerCase() !== "select") {
            return [];
        }

        return Array.from(el.options)
            .map(option => option.text.trim())
            .filter(Boolean);
    }

    function stripElement(field) {
        const clone = { ...field };
        delete clone.element;
        return clone;
    }

    function fillMatchedFields(matches) {
        let count = 0;

        matches.forEach(match => {
            const field = currentFields.find(f => f.index === match.index);

            if (!field || !field.element) return;

            const el = field.element;
            const tag = el.tagName.toLowerCase();
            const type = (el.getAttribute("type") || "").toLowerCase();

            if (type === "file") return;

            if (tag === "select") {
                setSelectValue(el, match.value);
            } else {
                setElementValue(el, match.value);
            }

            markFilled(el);
            count++;
        });

        return count;
    }

    function setElementValue(el, value) {
        el.focus();

        const type = (el.getAttribute("type") || "").toLowerCase();

        if (type === "url") {
            value = normalizeUrlValue(value);
        }

        if (el.isContentEditable || el.getAttribute("role") === "textbox") {
            el.innerText = value;
            dispatchEvents(el);
            return;
        }

        const tag = el.tagName.toLowerCase();

        try {
            if (tag === "textarea") {
                const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype,
                    "value"
                ).set;

                setter.call(el, value);
            } else {
                const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype,
                    "value"
                ).set;

                setter.call(el, value);
            }
        } catch (error) {
            el.value = value;
        }

        dispatchEvents(el);
    }

    function normalizeUrlValue(value) {
        value = String(value || "").trim();

        if (!value) return value;

        if (
            value.startsWith("http://") ||
            value.startsWith("https://")
        ) {
            return value;
        }

        if (value.startsWith("www.")) {
            return "https://" + value;
        }

        if (
            value.includes(".com") ||
            value.includes(".in") ||
            value.includes(".dev") ||
            value.includes(".io") ||
            value.includes(".net") ||
            value.includes(".org")
        ) {
            return "https://" + value;
        }

        return value;
    }

    function setSelectValue(select, value) {
        const normalizedValue = normalize(value);
        let matched = false;

        for (const option of select.options) {
            const optText = normalize(option.text);
            const optValue = normalize(option.value);

            if (
                optText.includes(normalizedValue) ||
                normalizedValue.includes(optText) ||
                optValue.includes(normalizedValue) ||
                normalizedValue.includes(optValue)
            ) {
                select.value = option.value;
                matched = true;
                break;
            }
        }

        if (!matched) {
            let bestOption = null;
            let bestScore = 0;

            for (const option of select.options) {
                const score = similarity(option.text, value);

                if (score > bestScore) {
                    bestScore = score;
                    bestOption = option;
                }
            }

            if (bestOption && bestScore > 0.45) {
                select.value = bestOption.value;
            }
        }

        dispatchEvents(select);
    }

    function fillFileInputs(file) {
        const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
        let count = 0;

        fileInputs.forEach(input => {
            try {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                input.files = dataTransfer.files;

                dispatchEvents(input);
                markFilled(input);
                count++;
            } catch (error) {
                console.warn("Could not auto-fill file input:", error);
            }
        });

        return count;
    }

    function dispatchEvents(el) {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
        el.dispatchEvent(new Event("blur", { bubbles: true }));
    }

    function markFilled(el) {
        el.style.outline = "2px solid #22c55e";
        el.style.backgroundColor = "#f0fdf4";
    }

    function normalize(text) {
        return String(text || "")
            .toLowerCase()
            .replace(/[_\-]+/g, " ")
            .replace(/[^a-z0-9@.+/%₹$ ]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function similarity(a, b) {
        a = normalize(a);
        b = normalize(b);

        if (!a || !b) return 0;

        const longer = a.length > b.length ? a : b;
        const shorter = a.length > b.length ? b : a;

        if (longer.length === 0) return 1;

        return (longer.length - editDistance(longer, shorter)) / longer.length;
    }

    function editDistance(a, b) {
        const matrix = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }

    function escapeHtml(text) {
        return String(text || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;");
    }
})();