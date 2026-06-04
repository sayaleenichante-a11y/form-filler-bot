(function () {
    const oldBot = document.getElementById("smart-form-bot");

    if (oldBot) {
        oldBot.remove();
    }

    if (document.getElementById("smart-ai-form-bot")) {
        return;
    }

    console.log("Smart AI Form Bot v6 loaded");

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
        const fileName = file.name.toLowerCase();

        resultBox.innerHTML = "";

        const isExcelFile =
            fileName.endsWith(".xlsx") ||
            fileName.endsWith(".xls") ||
            fileName.endsWith(".csv");

        const isImpactPage = checkImpactPredictionPage();

        /*
            MODE 1:
            Excel file + Impact Prediction section detected
            Runs Impact Prediction Excel loop filler.
        */
        if (isExcelFile && isImpactPage) {
            statusBox.innerText = "Impact Prediction section detected. Reading Excel...";

            try {
                const formData = new FormData();
                formData.append("file", file);

                const response = await fetch("http://127.0.0.1:5050/parse-impact-excel", {
                    method: "POST",
                    body: formData
                });

                const result = await response.json();

                if (!result.success) {
                    statusBox.innerText = result.error || "Excel parsing failed";
                    return;
                }

                if (!result.rows || result.rows.length === 0) {
                    statusBox.innerText = "No valid Impact Prediction rows found in Excel";
                    return;
                }

                resultBox.innerHTML = `
                    <div class="bot-success">Impact Prediction mode detected</div>
                    <div class="bot-success">Rows found: ${result.rows.length}</div>
                `;

                await fillImpactPredictionRows(result.rows);
                return;

            } catch (error) {
                console.error(error);
                statusBox.innerText =
                    "Impact Prediction Excel fill failed:\n" +
                    error.message +
                    "\n\nCheck backend server and extension permissions.";
                return;
            }
        }

        /*
            MODE 2:
            Normal document extraction and form filling.
        */
        currentFields = collectFormFields();

        if (!currentFields.length) {
            statusBox.innerText = "No fillable fields found on this page";
            return;
        }

        statusBox.innerText = "Extracting and matching fields...";

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
                <div class="bot-success">Normal Extract & Fill mode</div>
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
            statusBox.innerText =
                "Backend not running or error occurred:\n" +
                error.message;
        }
    });

    function checkImpactPredictionPage() {
        const pageText = document.body.innerText || "";

        return (
            pageText.includes("Impact Prediction") &&
            pageText.includes("Air Quality Impact Prediction") &&
            pageText.includes("Baseline Concentration") &&
            pageText.includes("Prescribed Standard")
        );
    }

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

            let filled = false;

            if (tag === "select") {
                filled = setSelectValue(el, match.value);
            } else {
                filled = setElementValue(el, match.value);
            }

            if (filled) {
                markFilled(el);
                count++;
            }
        });

        return count;
    }

    function setElementValue(el, value) {
        if (!el) return false;

        value = String(value ?? "").trim();

        try {
            el.focus();
        } catch (error) {
            console.warn("Focus failed:", error);
        }

        const type = (el.getAttribute("type") || "").toLowerCase();

        if (type === "url") {
            value = normalizeUrlValue(value);
        }

        if (el.isContentEditable || el.getAttribute("role") === "textbox") {
            el.innerText = value;
            dispatchEvents(el);
            return true;
        }

        const tag = el.tagName.toLowerCase();

        try {
            if (tag === "textarea") {
                const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype,
                    "value"
                )?.set;

                if (setter) {
                    setter.call(el, value);
                } else {
                    el.value = value;
                }
            } else {
                const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype,
                    "value"
                )?.set;

                if (setter) {
                    setter.call(el, value);
                } else {
                    el.value = value;
                }
            }
        } catch (error) {
            el.value = value;
        }

        dispatchEvents(el);
        return true;
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
        value = String(value || "").trim();

        if (!value) {
            return false;
        }

        const target = normalizeDropdownText(value);
        const options = Array.from(select.options);

        let matchedOption = null;

        matchedOption = options.find(option => {
            const optionText = normalizeDropdownText(option.textContent);
            const optionValue = normalizeDropdownText(option.value);

            return optionText === target || optionValue === target;
        });

        if (!matchedOption) {
            matchedOption = options.find(option => {
                const optionText = normalizeDropdownText(option.textContent);
                const optionValue = normalizeDropdownText(option.value);

                if (!optionText || optionText === "select") {
                    return false;
                }

                return (
                    optionText.includes(target) ||
                    target.includes(optionText) ||
                    optionValue.includes(target) ||
                    target.includes(optionValue)
                );
            });
        }

        if (!matchedOption) {
            matchedOption = options.find(option => {
                const optionText = normalizeDropdownText(option.textContent);
                const optionValue = normalizeDropdownText(option.value);
                const optionAll = optionText + " " + optionValue;

                if (target.includes("buffer") && optionAll.includes("buffer")) return true;
                if (target.includes("core") && optionAll.includes("core")) return true;

                if (target === "pm10" && optionAll.includes("pm10")) return true;
                if ((target === "pm25" || target === "pm2.5") && optionAll.includes("pm25")) return true;
                if (target === "so2" && optionAll.includes("so2")) return true;
                if (target === "nox" && optionAll.includes("nox")) return true;
                if (target === "co" && optionText === "co") return true;

                if (target.includes("microgram") && optionAll.includes("micro")) return true;
                if (target.includes("microgramperm3") && optionAll.includes("m3")) return true;
                if (target.includes("microgramperm3") && optionAll.includes("micro")) return true;
                if (target.includes("ugm3") && optionAll.includes("m3")) return true;

                return false;
            });
        }

        if (!matchedOption) {
            console.warn(
                "Dropdown not matched:",
                value,
                "Available options:",
                options.map(option => option.textContent + " = " + option.value)
            );

            markFailed(select);
            return false;
        }

        try {
            select.focus();
        } catch (error) {
            console.warn("Select focus failed:", error);
        }

        try {
            const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLSelectElement.prototype,
                "value"
            )?.set;

            if (nativeSetter) {
                nativeSetter.call(select, matchedOption.value);
            } else {
                select.value = matchedOption.value;
            }
        } catch (error) {
            select.value = matchedOption.value;
        }

        select.selectedIndex = options.indexOf(matchedOption);

        dispatchEvents(select);

        markFilled(select);

        console.log("Dropdown selected:", value, "=>", matchedOption.textContent);

        return true;
    }

    async function setSelectValueWithRetry(select, value, retries = 6, waitMs = 500) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            const success = setSelectValue(select, value);

            if (success) {
                return true;
            }

            console.log(
                "Retry dropdown:",
                value,
                "attempt",
                attempt,
                "of",
                retries
            );

            await delay(waitMs);
        }

        return false;
    }

    function normalizeDropdownText(text) {
        return String(text || "")
            .toLowerCase()
            .replace(/µ/g, "micro")
            .replace(/μ/g, "micro")
            .replace(/ug/g, "micro")
            .replace(/m³/g, "m3")
            .replace(/m 3/g, "m3")
            .replace(/m\^3/g, "m3")
            .replace(/per cubic meter/g, "per m3")
            .replace(/per cubic metre/g, "per m3")
            .replace(/microgram per metre cube/g, "microgram per m3")
            .replace(/microgram per meter cube/g, "microgram per m3")
            .replace(/microgram per cubic meter/g, "microgram per m3")
            .replace(/microgram per cubic metre/g, "microgram per m3")
            .replace(/microgram\/m3/g, "microgram per m3")
            .replace(/microgram\/m³/g, "microgram per m3")
            .replace(/µg\/m3/g, "microgram per m3")
            .replace(/µg\/m³/g, "microgram per m3")
            .replace(/ug\/m3/g, "microgram per m3")
            .replace(/pm\s*2\.5/g, "pm25")
            .replace(/pm\s*10/g, "pm10")
            .replace(/pm-10/g, "pm10")
            .replace(/pm-2\.5/g, "pm25")
            .replace(/so₂/g, "so2")
            .replace(/[^a-z0-9.]+/g, "")
            .trim();
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

    function markFailed(el) {
        el.style.outline = "2px solid #ef4444";
        el.style.backgroundColor = "#fef2f2";
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

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getImpactPredictionSection() {
        const containers = Array.from(document.querySelectorAll("form, section, fieldset, div"));

        const matchingSections = containers.filter(container => {
            const text = container.innerText || "";

            return (
                text.includes("Impact Prediction") &&
                text.includes("Baseline Concentration") &&
                text.includes("Prescribed Standard") &&
                text.includes("Add")
            );
        });

        if (!matchingSections.length) {
            throw new Error("Impact Prediction section not found. Open Section 16 first.");
        }

        matchingSections.sort((a, b) => a.innerText.length - b.innerText.length);

        return matchingSections[0];
    }

    function getImpactControls(section) {
        const controls = Array.from(section.querySelectorAll("input, select, textarea"))
            .filter(el => {
                if (el.closest("#smart-ai-form-bot")) return false;

                const type = (el.getAttribute("type") || "").toLowerCase();

                if (["hidden", "file", "button", "submit", "reset"].includes(type)) {
                    return false;
                }

                const rect = el.getBoundingClientRect();

                return rect.width > 0 && rect.height > 0;
            });

        return controls;
    }

    function setImpactControlValue(el, value, fallbackValue = "") {
        if (!el) {
            return false;
        }

        value = String(value ?? "").trim();

        if (!value && fallbackValue) {
            value = fallbackValue;
        }

        if (!value) {
            markFailed(el);
            return false;
        }

        const tag = el.tagName.toLowerCase();

        let filled = false;

        if (tag === "select") {
            filled = setSelectValue(el, value);
        } else {
            filled = setElementValue(el, value);
        }

        if (filled) {
            markFilled(el);
        } else {
            markFailed(el);
            console.warn("Failed to fill impact field:", value, el);
        }

        return filled;
    }

    function findImpactAddButton(section) {
        const buttons = Array.from(
            section.querySelectorAll("button, input[type='button'], input[type='submit']")
        );

        return buttons.find(button => {
            const text = (button.innerText || button.value || "").toLowerCase();
            return text.includes("add");
        });
    }

   function clickLikeUser(element) {
    element.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

    if (typeof element.click === "function") {
        element.click();
    }
}

    async function fillOneImpactRow(row, rowNumber, totalRows) {
        const section = getImpactPredictionSection();
        const controls = getImpactControls(section);

        if (controls.length < 13) {
            throw new Error("Impact Prediction inputs not found properly. Found only " + controls.length);
        }

        const safeUnit = row.unit || "Microgram per m3";
        const safeCoreBuffer = row.core_buffer || "Buffer Zone";

        statusBox.innerText =
            "Filling row " + rowNumber + " of " + totalRows +
            "\nLocation: " + row.monitoring_location +
            "\nPollutant: " + row.criteria_pollutant +
            "\nUnit: " + safeUnit;

        console.log("Filling Impact Row:", rowNumber, row);

        let ok = true;

        ok = setImpactControlValue(controls[0], row.lat_deg) && ok;
        ok = setImpactControlValue(controls[1], row.lat_min) && ok;
        ok = setImpactControlValue(controls[2], row.lat_sec) && ok;

        ok = setImpactControlValue(controls[3], row.long_deg) && ok;
        ok = setImpactControlValue(controls[4], row.long_min) && ok;
        ok = setImpactControlValue(controls[5], row.long_sec) && ok;

        ok = await setSelectValueWithRetry(controls[6], safeCoreBuffer, 5, 400) && ok;

        ok = await setSelectValueWithRetry(controls[7], row.criteria_pollutant, 5, 400) && ok;

        await delay(900);

        ok = await setSelectValueWithRetry(controls[8], safeUnit, 8, 600) && ok;

        ok = setImpactControlValue(controls[9], row.baseline_concentration) && ok;
        ok = setImpactControlValue(controls[10], row.predicted_incremental) && ok;
        ok = setImpactControlValue(controls[11], row.total_glc) && ok;
        ok = setImpactControlValue(controls[12], row.prescribed_standard) && ok;

        await delay(900);

        if (!ok) {
            console.warn("Some fields failed in row", rowNumber, row);
        }

        const addButton = findImpactAddButton(section);

        if (!addButton) {
            throw new Error("Add button not found inside Impact Prediction section");
        }

        console.log("Clicking Add button for row:", rowNumber);

        clickLikeUser(addButton);

        await delay(1500);
    }

    async function fillImpactPredictionRows(rows) {
        let completed = 0;
        let failed = 0;

        for (let i = 0; i < rows.length; i++) {
            try {
                await fillOneImpactRow(rows[i], i + 1, rows.length);
                completed++;

                resultBox.innerHTML = `
                    <div class="bot-success">Rows found: ${rows.length}</div>
                    <div class="bot-success">Completed: ${completed}</div>
                    <div class="bot-success">Failed: ${failed}</div>
                `;
            } catch (error) {
                console.error("Row failed:", i + 1, error);
                failed++;

                resultBox.innerHTML = `
                    <div class="bot-success">Rows found: ${rows.length}</div>
                    <div class="bot-success">Completed: ${completed}</div>
                    <div style="color:red;">Failed: ${failed}</div>
                    <div style="color:red;">Last error: ${escapeHtml(error.message)}</div>
                `;
            }
        }

        statusBox.innerText =
            "Impact Prediction completed.\n" +
            "Rows added: " + completed + "\n" +
            "Rows failed: " + failed;
    }
})();