
(function () {
    const BOT_ID = "smart-ai-form-bot";
    const BACKEND = "http://127.0.0.1:5050";

    document
        .getElementById("smart-form-bot")
        ?.remove();

    if (document.getElementById(BOT_ID)) {
        return;
    }

    let currentFields = [];
    let lastMatches = [];

    const bot = document.createElement("div");
    bot.id = BOT_ID;

    bot.innerHTML = `
        <div class="bot-header">
            <span>🤖 Smart Form Bot</span>
            <button id="bot-toggle" type="button">−</button>
        </div>

        <div id="bot-body">
            <p class="bot-small">
                Upload PDF, Word, Excel, CSV or image and click Extract & Fill.
            </p>

            <input
                id="bot-file"
                type="file"
                accept=".pdf,.docx,.txt,.xlsx,.xls,.xlsm,.csv,.pptx,.rtf,.html,.json,.png,.jpg,.jpeg,.webp,.bmp,.tiff"
            />

            <button id="bot-scan-btn" type="button">
                Scan Form
            </button>

            <button id="bot-fill-btn" type="button">
                Extract & Fill
            </button>

            <div id="bot-status">Ready</div>
            <div id="bot-result"></div>
        </div>
    `;

    document.body.appendChild(bot);

    const body =
        document.getElementById("bot-body");

    const statusBox =
        document.getElementById("bot-status");

    const resultBox =
        document.getElementById("bot-result");


    document
        .getElementById("bot-toggle")
        .addEventListener(
            "click",
            event => {
                const hidden =
                    body.style.display === "none";

                body.style.display =
                    hidden
                        ? "block"
                        : "none";

                event.currentTarget.textContent =
                    hidden
                        ? "−"
                        : "+";
            }
        );


    document
        .getElementById("bot-scan-btn")
        .addEventListener(
            "click",
            () => {
                currentFields =
                    collectFormFields();

                statusBox.textContent =
                    `Found ${currentFields.length} fillable fields`;

                resultBox.innerHTML =
                    renderScannedFields(
                        currentFields
                    );
            }
        );


    document
        .getElementById("bot-fill-btn")
        .addEventListener(
            "click",
            async () => {
                const input =
                    document.getElementById(
                        "bot-file"
                    );

                if (!input.files.length) {
                    statusBox.textContent =
                        "Please upload a file first";

                    return;
                }

                const file =
                    input.files[0];

                const extension =
                    "." +
                    file.name
                        .toLowerCase()
                        .split(".")
                        .pop();

                const structured = [
                    ".xlsx",
                    ".xls",
                    ".xlsm",
                    ".csv",
                    ".docx",
                    ".pdf"
                ].includes(extension);

                currentFields =
                    collectFormFields();

                if (!currentFields.length) {
                    statusBox.textContent =
                        "No fillable fields found";

                    return;
                }

                try {
                    if (
                        structured &&
                        findRepeatedAddButton()
                    ) {
                        await runStructuredMode(
                            file
                        );

                    } else {
                        await runSingleFormMode(
                            file
                        );
                    }

                } catch (error) {
                    console.error(error);

                    statusBox.textContent =
                        error.message ||
                        "Unexpected error";
                }
            }
        );


    async function runSingleFormMode(file) {
        statusBox.textContent =
            "Extracting and matching fields...";

        const data =
            new FormData();

        data.append(
            "file",
            file
        );

        data.append(
            "fields",
            JSON.stringify(
                currentFields.map(
                    stripElement
                )
            )
        );

        const result =
            await postForm(
                "/extract-smart",
                data
            );

        lastMatches =
            normalizeMatches(
                result.matches || []
            );

        const summary =
            fillMatchedFields(
                lastMatches
            );

        const uploadedFiles =
            fillFileInputsSafely(file);

        statusBox.textContent =
            `Filled ${summary.autoFilled}; ` +
            `review ${summary.review}; ` +
            `manual ${summary.manual}; ` +
            `failed ${summary.failed}`;

        resultBox.innerHTML =
            renderSummary(
                result,
                summary,
                uploadedFiles
            );
    }


    async function runStructuredMode(file) {
        statusBox.textContent =
            "Reading table rows and matching headings...";

        const data =
            new FormData();

        data.append(
            "file",
            file
        );

        data.append(
            "fields",
            JSON.stringify(
                currentFields.map(
                    stripElement
                )
            )
        );

        const result =
            await postForm(
                "/parse-structured-file",
                data
            );

        const mappedRows =
            result.mappedRows || [];

        if (!mappedRows.length) {
            throw new Error(
                "No rows could be mapped with this form"
            );
        }

        await fillDynamicStructuredRows(
            mappedRows
        );
    }


    async function postForm(path, data) {
        const response =
            await fetch(
                BACKEND + path,
                {
                    method: "POST",
                    body: data
                }
            );

        const text =
            await response.text();

        let result;

        try {
            result = JSON.parse(text);

        } catch {
            throw new Error(
                "Backend returned invalid response: " +
                text.slice(0, 200)
            );
        }

        if (
            !response.ok ||
            !result.success
        ) {
            throw new Error(
                result.error ||
                `Request failed (${response.status})`
            );
        }

        return result;
    }


    async function fillDynamicStructuredRows(
        mappedRows
    ) {
        let completed = 0;
        let failed = 0;

        for (
            let index = 0;
            index < mappedRows.length;
            index++
        ) {
            currentFields =
                collectFormFields();

            const matches =
                normalizeMatches(
                    mappedRows[index].matches ||
                    []
                );

            const summary =
                fillMatchedFields(matches);

            const filled =
                summary.autoFilled +
                summary.review;

            if (!filled) {
                failed++;

                console.warn(
                    "No usable match in row",
                    index + 1,
                    mappedRows[index]
                );

                continue;
            }

            await delay(500);

            const addButton =
                findRepeatedAddButton();

            if (!addButton) {
                throw new Error(
                    "Add button not found"
                );
            }

            const missing =
                requiredFieldsForAddButton(
                    addButton
                ).filter(
                    field =>
                        !fieldHasValue(field)
                );

            if (missing.length) {
                failed++;

                console.warn(
                    "Required fields near the Add button are still empty",
                    missing
                );

                continue;
            }

            clickLikeUser(addButton);

            completed++;

            statusBox.textContent =
                `Row ${index + 1}/${mappedRows.length} added`;

            resultBox.innerHTML = `
                <div class="bot-success">
                    Completed: ${completed}
                </div>

                <div style="color:red">
                    Failed: ${failed}
                </div>
            `;

            await delay(1200);
        }

        statusBox.textContent =
            `Rows completed: ${completed}; ` +
            `rows failed: ${failed}`;
    }


    function getAccessibleDocuments() {
        const documents = [];
        const queue = [document];
        const visited = new Set();

        while (queue.length) {
            const currentDocument =
                queue.shift();

            if (
                !currentDocument ||
                visited.has(currentDocument)
            ) {
                continue;
            }

            visited.add(currentDocument);
            documents.push(currentDocument);

            let frames = [];

            try {
                frames = [
                    ...currentDocument
                        .querySelectorAll("iframe")
                ];

            } catch {
                frames = [];
            }

            for (const frame of frames) {
                try {
                    const frameDocument =
                        frame.contentDocument;

                    if (
                        frameDocument
                            ?.documentElement &&
                        !visited.has(
                            frameDocument
                        )
                    ) {
                        queue.push(
                            frameDocument
                        );
                    }

                } catch {
                    // Cross-origin iframe ignored.
                }
            }
        }

        return documents;
    }


    function getAllFormElements() {
        const selector = [
            "input",
            "textarea",
            "select",
            "[contenteditable='true']",
            "[role='textbox']",
            "[role='combobox']",
            "[role='spinbutton']"
        ].join(",");

        const result = [];

        for (
            const currentDocument
            of getAccessibleDocuments()
        ) {
            result.push(
                ...currentDocument
                    .querySelectorAll(selector)
            );

            for (
                const node
                of currentDocument
                    .querySelectorAll("*")
            ) {
                if (node.shadowRoot) {
                    result.push(
                        ...node.shadowRoot
                            .querySelectorAll(
                                selector
                            )
                    );
                }
            }
        }

        return [
            ...new Set(result)
        ];
    }


    function collectFormFields() {
        const fields = [];

        for (
            const element
            of getAllFormElements()
        ) {
            if (
                !isFillable(element) ||
                element.closest(
                    `#${BOT_ID}`
                )
            ) {
                continue;
            }

            const index =
                fields.length;

            const fieldId =
                ensureFieldId(
                    element,
                    index
                );

            fields.push({
                index,
                fieldId,

                tag:
                    element.tagName
                        .toLowerCase(),

                type:
                    getFieldType(element),

                name:
                    element.name || "",

                id:
                    element.id || "",

                placeholder:
                    element.placeholder || "",

                ariaLabel:
                    element.getAttribute(
                        "aria-label"
                    ) || "",

                title:
                    element.title || "",

                role:
                    element.getAttribute(
                        "role"
                    ) || "",

                autocomplete:
                    element.autocomplete || "",

                label:
                    getBestLabel(element),

                nearText:
                    getNearbyText(element),

                sectionTitle:
                    getSectionTitle(element),

                tableLabel:
                    getTableLabel(element),

                options:
                    element.tagName
                        .toLowerCase() ===
                    "select"
                        ? [
                            ...element.options
                        ].map(
                            option => ({
                                text:
                                    cleanText(
                                        option.textContent
                                    ),
                                value:
                                    option.value
                            })
                        )
                        : [],

                required:
                    !!element.required ||
                    element.getAttribute(
                        "aria-required"
                    ) === "true" ||
                    hasVisualRequiredMarker(element),

                element
            });
        }

        return fields;
    }


    function isFillable(element) {
        const type = (
            element.type || ""
        ).toLowerCase();

        if (
            [
                "hidden",
                "submit",
                "button",
                "reset",
                "image",
                "password"
            ].includes(type)
        ) {
            return false;
        }

        if (
            element.disabled ||
            element.readOnly
        ) {
            return false;
        }

        const view =
            element.ownerDocument
                .defaultView ||
            window;

        const style =
            view.getComputedStyle(
                element
            );

        const rect =
            element.getBoundingClientRect();

        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0
        );
    }


    function getFieldType(element) {
        const tag =
            element.tagName
                .toLowerCase();

        if (tag === "select") {
            return "select";
        }

        if (tag === "textarea") {
            return "textarea";
        }

        if (element.isContentEditable) {
            return "contenteditable";
        }

        const role =
            element.getAttribute("role");

        if (role === "combobox") {
            return "select";
        }

        if (role === "spinbutton") {
            return "number";
        }

        return (
            element.type ||
            "text"
        ).toLowerCase();
    }


    function ensureFieldId(
        element,
        index
    ) {
        if (
            !element.dataset
                .smartFieldId
        ) {
            element.dataset.smartFieldId =
                `smart_${Date.now()}_${index}_` +
                Math.random()
                    .toString(16)
                    .slice(2);
        }

        return element.dataset
            .smartFieldId;
    }

    function getAncestorFieldText(element) {
    let current = element.parentElement;
    let bestText = "";

    for (
        let depth = 0;
        current && depth < 6;
        depth++
    ) {
        const clone = current.cloneNode(true);

        clone
            .querySelectorAll(
                "input, textarea, select, button, script, style"
            )
            .forEach(node => node.remove());

        const text = String(
            clone.textContent || ""
        )
            .replace(/\s+/g, " ")
            .trim();

        if (
            text &&
            text.length <= 350 &&
            (
                !bestText ||
                text.length < bestText.length
            )
        ) {
            bestText = text;
        }

        current = current.parentElement;
    }

    return bestText;
}


function hasVisualRequiredMarker(element) {
    let current = element.parentElement;

    for (
        let depth = 0;
        current && depth < 5;
        depth++
    ) {
        const controls = current.querySelectorAll(
            "input, textarea, select"
        ).length;

        const text = String(
            current.textContent || ""
        );

        if (
            controls <= 4 &&
            (
                text.includes("*") ||
                current.querySelector(
                    ".required, .mandatory, [data-required='true']"
                )
            )
        ) {
            return true;
        }

        current = current.parentElement;
    }

    return false;
}


    function getBestLabel(element) {
        const currentDocument =
            element.ownerDocument;

        const parts = [];

        const ancestorText =
            getAncestorFieldText(element);

        if (ancestorText) {
            parts.push(ancestorText);
}

        if (element.id) {
            try {
                const label =
                    currentDocument
                        .querySelector(
                            `label[for="${cssEscape(element.id)}"]`
                        );

                if (label) {
                    parts.push(
                        label.textContent
                    );
                }

            } catch {
                // Ignore invalid selector.
            }
        }

        const parentLabel =
            element.closest("label");

        if (parentLabel) {
            parts.push(
                parentLabel.textContent
            );
        }

        const labelledBy =
            element.getAttribute(
                "aria-labelledby"
            );

        if (labelledBy) {
            for (
                const id
                of labelledBy.split(/\s+/)
            ) {
                parts.push(
                    currentDocument
                        .getElementById(id)
                        ?.textContent ||
                    ""
                );
            }
        }

        parts.push(
            element.getAttribute(
                "aria-label"
            ) || "",

            element.placeholder || "",
            element.title || "",

            getTableLabel(element),

            readableName(
                element.name
            ),

            readableName(
                element.id
            )
        );

        return uniqueText(parts)
            .join(" | ")
            .slice(0, 400);
    }


    function getNearbyText(element) {
        const parent =
            element.closest(
                ".form-group," +
                ".field," +
                ".input-group," +
                ".row," +
                ".col," +
                "td," +
                "tr," +
                "section," +
                "fieldset," +
                "div"
            );

        if (!parent) {
            return "";
        }

        const clone =
            parent.cloneNode(true);

        clone
            .querySelectorAll(
                "input," +
                "textarea," +
                "select," +
                "button," +
                "script," +
                "style"
            )
            .forEach(
                node => node.remove()
            );

        return cleanText(
            clone.textContent
        ).slice(0, 600);
    }


    function getSectionTitle(element) {
        const container =
            element.closest(
                "section," +
                "fieldset," +
                ".card," +
                ".panel," +
                "form," +
                "div"
            );

        const title =
            container?.querySelector(
                "legend," +
                "h1," +
                "h2," +
                "h3," +
                "h4," +
                "h5," +
                "h6," +
                ".title," +
                ".heading"
            )?.textContent || "";

        return cleanText(title)
            .slice(0, 180);
    }


    function getTableLabel(element) {
        const row =
            element.closest("tr");

        if (!row) {
            return "";
        }

        return [
            ...row.children
        ]
            .filter(
                cell =>
                    !cell.contains(
                        element
                    )
            )
            .map(
                cell =>
                    cleanText(
                        cell.textContent
                    )
            )
            .filter(Boolean)
            .join(" | ")
            .slice(0, 250);
    }


    function stripElement(field) {
        const copy = {
            ...field
        };

        delete copy.element;

        return copy;
    }


    function normalizeMatches(matches) {
        return matches.map(
            match => {
                let confidence = Number(
                    match.confidence ?? 0
                );

                if (
                    confidence > 0 &&
                    confidence <= 1
                ) {
                    confidence *= 100;
                }

                if (
                    !Number.isFinite(
                        confidence
                    )
                ) {
                    confidence = 0;
                }

                const value = String(
                    match.value ?? ""
                ).trim();

                const status =
                    match.status ||
                    (
                        !value
                            ? "manual_required"
                            : confidence >= 80
                                ? "auto_fill"
                                : confidence >= 55
                                    ? "review"
                                    : "manual_required"
                    );

                return {
                    ...match,
                    confidence,
                    value,
                    status
                };
            }
        );
    }


    function fillMatchedFields(matches) {
        const summary = {
            autoFilled: 0,
            review: 0,
            manual: 0,
            failed: 0
        };

        for (const match of matches) {
            const field =
                findFieldForMatch(
                    match
                );

            if (!field) {
                summary.failed++;
                continue;
            }

            if (
                !match.value ||
                match.status ===
                    "manual_required" ||
                match.confidence < 55
            ) {
                mark(
                    field.element,
                    "manual"
                );

                summary.manual++;

                continue;
            }

            const success =
                fillSingleField(
                    field,
                    match.value
                );

            if (!success) {
                mark(
                    field.element,
                    "failed"
                );

                summary.failed++;

            } else if (
                match.status === "review" ||
                match.confidence < 80
            ) {
                mark(
                    field.element,
                    "review"
                );

                summary.review++;

            } else {
                mark(
                    field.element,
                    "filled"
                );

                summary.autoFilled++;
            }
        }

        return summary;
    }


    function findFieldForMatch(match) {
        if (match.fieldId) {
            const exact =
                currentFields.find(
                    field =>
                        field.fieldId ===
                        match.fieldId
                );

            if (exact) {
                return exact;
            }
        }

        const searchText = [
            match.label,
            match.matched_key
        ]
            .filter(Boolean)
            .join(" ");

        if (!searchText) {
            return null;
        }

        const ranked =
            currentFields
                .map(
                    field => ({
                        field,

                        score:
                            similarity(
                                searchText,
                                [
                                    field.label,
                                    field.name,
                                    field.id,
                                    field.placeholder,
                                    field.tableLabel,
                                    field.sectionTitle
                                ].join(" ")
                            )
                    })
                )
                .sort(
                    (first, second) =>
                        second.score -
                        first.score
                );

        if (
            ranked[0]?.score >= 0.55
        ) {
            return ranked[0].field;
        }

        return null;
    }


    function fillSingleField(
        field,
        rawValue
    ) {
        const element =
            field.element;

        const type =
            field.type;

        if (type === "select") {
            return setSelectValue(
                element,
                rawValue
            );
        }

        if (type === "checkbox") {
            element.checked =
                yesValue(rawValue);

            dispatchEvents(element);

            return true;
        }

        if (type === "radio") {
            return setRadioValue(
                field,
                rawValue
            );
        }

        const value =
            prepareValue(
                element,
                rawValue
            );

        if (value === null) {
            return false;
        }

        if (element.isContentEditable) {
            element.textContent = value;

        } else {
            setNativeValue(
                element,
                value
            );
        }

        dispatchEvents(element);

        return true;
    }


    function prepareValue(
        element,
        rawValue
    ) {
        const type = (
            element.type || ""
        ).toLowerCase();

        const value = String(
            rawValue ?? ""
        ).trim();

        if (!value) {
            return null;
        }

        if (
            [
                "number",
                "range"
            ].includes(type)
        ) {
            return normalizeNumber(
                value
            );
        }

        if (type === "date") {
            return normalizeDate(
                value
            );
        }

        if (type === "month") {
            return (
                normalizeDate(value)
                    ?.slice(0, 7)
                || null
            );
        }

        if (type === "email") {
            return (
                value.match(
                    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
                )?.[0]
                || null
            );
        }

        if (type === "tel") {
            const phone =
                value.replace(
                    /[^\d+]/g,
                    ""
                );

            return (
                phone.length >= 8
                    ? phone
                    : null
            );
        }

        if (type === "url") {
            if (
                /^https?:\/\//i.test(
                    value
                )
            ) {
                return value;
            }

            if (
                /\.[A-Za-z]{2,}/.test(
                    value
                )
            ) {
                return "https://" + value;
            }

            return null;
        }

        return value;
    }


    function normalizeNumber(value) {
        let text = String(value)
            .replace(/,/g, "")
            .replace(/[₹$%]/g, "")
            .replace(
                /\b(?:INR|Rs\.?)\b/gi,
                ""
            )
            .trim();

        let match = text.match(
            /^(-?\d+(?:\.\d+)?)\s*(lpa|lakhs?|lacs?)$/i
        );

        if (match) {
            return String(
                Number(match[1]) *
                100000
            );
        }

        match = text.match(
            /^(-?\d+(?:\.\d+)?)\s*(crores?|cr)$/i
        );

        if (match) {
            return String(
                Number(match[1]) *
                10000000
            );
        }

        match = text.match(
            /^(-?\d+(?:\.\d+)?)\s*(thousand|k)$/i
        );

        if (match) {
            return String(
                Number(match[1]) *
                1000
            );
        }

        if (
            /^-?\d+(?:\.\d+)?$/.test(
                text
            )
        ) {
            return text;
        }

        return null;
    }


    function normalizeDate(value) {
        let match = String(value)
            .match(
                /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/
            );

        if (match) {
            return (
                `${match[1]}-` +
                `${pad2(match[2])}-` +
                `${pad2(match[3])}`
            );
        }

        match = String(value)
            .match(
                /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/
            );

        if (match) {
            return (
                `${match[3]}-` +
                `${pad2(match[2])}-` +
                `${pad2(match[1])}`
            );
        }

        return null;
    }


    function setSelectValue(
        select,
        rawValue
    ) {
        const target =
            compact(rawValue);

        const options = [
            ...select.options
        ].filter(
            option => {
                const text =
                    compact(
                        option.textContent
                    );

                return (
                    text &&
                    ![
                        "select",
                        "choose",
                        "pleasechoose"
                    ].includes(text)
                );
            }
        );

        let best =
            options.find(
                option =>
                    compact(
                        option.textContent
                    ) === target ||
                    compact(
                        option.value
                    ) === target
            );

        if (!best) {
            const ranked =
                options
                    .map(
                        option => ({
                            option,

                            score:
                                similarity(
                                    rawValue,
                                    `${option.textContent} ${option.value}`
                                )
                        })
                    )
                    .sort(
                        (first, second) =>
                            second.score -
                            first.score
                    );

            if (
                ranked[0]?.score >= 0.55
            ) {
                best =
                    ranked[0].option;
            }
        }

        if (!best) {
            return false;
        }

        setNativeValue(
            select,
            best.value
        );

        select.selectedIndex = [
            ...select.options
        ].indexOf(best);

        dispatchEvents(select);

        return true;
    }


    function setRadioValue(
        field,
        rawValue
    ) {
        const currentDocument =
            field.element
                .ownerDocument;

        const name =
            field.element.name;

        const radios = name
            ? [
                ...currentDocument
                    .querySelectorAll(
                        `input[type="radio"][name="${cssEscape(name)}"]`
                    )
            ]
            : [field.element];

        const target =
            compact(rawValue);

        const radio =
            radios.find(
                item =>
                    compact(
                        `${getBestLabel(item)} ${item.value}`
                    ).includes(target)
            );

        if (!radio) {
            return false;
        }

        radio.checked = true;

        dispatchEvents(radio);

        return true;
    }


    function setNativeValue(
        element,
        value
    ) {
        const view =
            element.ownerDocument
                .defaultView ||
            window;

        let prototype;

        if (
            element.tagName ===
            "INPUT"
        ) {
            prototype =
                view.HTMLInputElement
                    .prototype;

        } else if (
            element.tagName ===
            "TEXTAREA"
        ) {
            prototype =
                view.HTMLTextAreaElement
                    .prototype;

        } else {
            prototype =
                view.HTMLSelectElement
                    .prototype;
        }

        const setter =
            Object
                .getOwnPropertyDescriptor(
                    prototype,
                    "value"
                )
                ?.set;

        if (setter) {
            setter.call(
                element,
                value
            );

        } else {
            element.value = value;
        }
    }


    function dispatchEvents(element) {
        const view =
            element.ownerDocument
                .defaultView ||
            window;

        element.dispatchEvent(
            new view.Event(
                "input",
                {
                    bubbles: true
                }
            )
        );

        element.dispatchEvent(
            new view.Event(
                "change",
                {
                    bubbles: true
                }
            )
        );

        element.dispatchEvent(
            new view.Event(
                "blur",
                {
                    bubbles: true
                }
            )
        );
    }


    function fillFileInputsSafely(file) {
        const inputs =
            getAllFormElements()
                .filter(
                    element =>
                        element.tagName
                            ?.toLowerCase() ===
                            "input" &&

                        (
                            element.type || ""
                        ).toLowerCase() ===
                            "file" &&

                        !element.closest(
                            `#${BOT_ID}`
                        )
                );

        let updated = 0;

        for (const input of inputs) {
            try {
                const transfer =
                    new DataTransfer();

                transfer.items.add(file);

                input.files =
                    transfer.files;

                dispatchEvents(input);

                mark(
                    input,
                    "filled"
                );

                updated++;

            } catch (error) {
                console.debug(
                    "File input could not be updated",
                    error
                );
            }
        }

        return updated;
    }


    function findRepeatedAddButton() {
        const selectors = [
            "button",
            "input[type='button']",
            "input[type='submit']",
            "[role='button']"
        ].join(",");

        for (
            const currentDocument
            of getAccessibleDocuments()
        ) {
            const buttons = [
                ...currentDocument
                    .querySelectorAll(
                        selectors
                    )
            ];

            const found =
                buttons.find(
                    button => {
                        if (
                            button.closest(
                                `#${BOT_ID}`
                            ) ||
                            button.disabled
                        ) {
                            return false;
                        }

                        const rect =
                            button
                                .getBoundingClientRect();

                        if (
                            !rect.width ||
                            !rect.height
                        ) {
                            return false;
                        }

                        const text =
                            cleanText(
                                button.innerText ||
                                button.value ||
                                button.getAttribute(
                                    "aria-label"
                                )
                            );

                        return (
                            /^(add|add row|add record|add entry|save and add|save & add|add details)\b/i
                                .test(text)
                        );
                    }
                );

            if (found) {
                return found;
            }
        }

        return null;
    }


    function getRepeatedEntryContainer(
        addButton
    ) {
        const selectors = [
            "form",
            "fieldset",
            "section",
            ".card",
            ".panel",
            ".accordion",
            ".tab-pane",
            ".form-section",
            ".row",
            "div"
        ];

        for (const selector of selectors) {
            const container =
                addButton.closest(
                    selector
                );

            if (!container) {
                continue;
            }

            const fieldsInside =
                currentFields.filter(
                    field =>
                        container.contains(
                            field.element
                        )
                );

            if (
                fieldsInside.length >= 2
            ) {
                return container;
            }
        }

        return addButton.ownerDocument
            .body;
    }


    function requiredFieldsForAddButton(
        addButton
    ) {
        const container =
            getRepeatedEntryContainer(
                addButton
            );

        return currentFields.filter(
            field =>
                field.required &&
                field.type !== "file" &&
                container.contains(
                    field.element
                )
        );
    }


    function fieldHasValue(field) {
        const element =
            field.element;

        if (
            field.type === "checkbox" ||
            field.type === "radio"
        ) {
            return !!element.checked;
        }

        return (
            String(
                element.value ??
                element.textContent ??
                ""
            ).trim() !== ""
        );
    }


    function clickLikeUser(element) {
        element.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });

        element.focus?.();
        element.click();
    }


    function mark(element, state) {
        const styles = {
            filled: [
                "#22c55e",
                "#f0fdf4",
                "solid"
            ],

            review: [
                "#f59e0b",
                "#fffbeb",
                "solid"
            ],

            manual: [
                "#64748b",
                "#f8fafc",
                "dashed"
            ],

            failed: [
                "#ef4444",
                "#fef2f2",
                "solid"
            ]
        };

        const [
            color,
            background,
            style
        ] = styles[state];

        element.style.outline =
            `2px ${style} ${color}`;

        element.style.backgroundColor =
            background;
    }


    function renderScannedFields(fields) {
        return `
            <div class="bot-success">
                Fields found: ${fields.length}
            </div>

            <details open>
                <summary>Scanned fields</summary>

                ${
                    fields
                        .slice(0, 60)
                        .map(
                            field => `
                                <div class="bot-field">
                                    #${field.index}
                                    [${escapeHtml(field.type)}]
                                    ${
                                        escapeHtml(
                                            field.label ||
                                            field.name ||
                                            field.id ||
                                            field.placeholder
                                        )
                                    }
                                </div>
                            `
                        )
                        .join("")
                }
            </details>
        `;
    }


    function renderSummary(
        result,
        summary,
        uploadedFiles = 0
    ) {
        return `
            <div class="bot-success">
                Candidates:
                ${result.candidate_count || 0}
            </div>

            <div class="bot-success">
                Auto filled:
                ${summary.autoFilled}
            </div>

            <div>
                Review:
                ${summary.review}
            </div>

            <div>
                Manual:
                ${summary.manual}
            </div>

            <div style="color:red">
                Failed:
                ${summary.failed}
            </div>

            <div class="bot-success">
                File inputs updated:
                ${uploadedFiles}
            </div>

            <details>
                <summary>
                    Extracted data
                </summary>

                <pre>${
                    escapeHtml(
                        JSON.stringify(
                            result.entities || {},
                            null,
                            2
                        )
                    )
                }</pre>
            </details>
        `;
    }


    function cleanText(value) {
        return String(value || "")
            .replace(/\*/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }


    function readableName(value) {
        return cleanText(
            String(value || "")
                .replace(/[_-]+/g, " ")
                .replace(
                    /([a-z])([A-Z])/g,
                    "$1 $2"
                )
        );
    }


    function uniqueText(values) {
        const seen = new Set();

        return values
            .map(cleanText)
            .filter(
                value => {
                    if (!value) {
                        return false;
                    }

                    const key =
                        value.toLowerCase();

                    if (seen.has(key)) {
                        return false;
                    }

                    seen.add(key);

                    return true;
                }
            );
    }


    function normalize(value) {
        return cleanText(value)
            .toLowerCase()
            .replace(/[_-]+/g, " ")
            .replace(
                /[^a-z0-9@.+/% ]+/g,
                " "
            )
            .replace(/\s+/g, " ")
            .trim();
    }


    function compact(value) {
        return normalize(value)
            .replace(
                /bachelor of engineering/g,
                "be"
            )
            .replace(
                /bachelor of technology/g,
                "btech"
            )
            .replace(
                /master of technology/g,
                "mtech"
            )
            .replace(
                /microgram per cubic met(?:er|re)/g,
                "microgramperm3"
            )
            .replace(
                /µ|μ|ug/g,
                "micro"
            )
            .replace(
                /m³|m\^3/g,
                "m3"
            )
            .replace(
                /[^a-z0-9.]+/g,
                ""
            );
    }


    function similarity(a, b) {
        a = normalize(a);
        b = normalize(b);

        if (!a || !b) {
            return 0;
        }

        if (a === b) {
            return 1;
        }

        if (
            a.includes(b) ||
            b.includes(a)
        ) {
            return 0.92;
        }

        const aWords =
            new Set(
                a.split(" ")
                    .filter(Boolean)
            );

        const bWords =
            new Set(
                b.split(" ")
                    .filter(Boolean)
            );

        let common = 0;

        for (const word of aWords) {
            if (bWords.has(word)) {
                common++;
            }
        }

        const token =
            common /
            Math.max(
                aWords.size,
                bWords.size,
                1
            );

        return Math.max(
            token,
            sequenceRatio(a, b)
        );
    }


    function sequenceRatio(a, b) {
        const rows =
            b.length + 1;

        const columns =
            a.length + 1;

        const matrix =
            Array.from(
                {
                    length: rows
                },
                () =>
                    Array(columns)
                        .fill(0)
            );

        for (
            let row = 0;
            row < rows;
            row++
        ) {
            matrix[row][0] = row;
        }

        for (
            let column = 0;
            column < columns;
            column++
        ) {
            matrix[0][column] =
                column;
        }

        for (
            let row = 1;
            row < rows;
            row++
        ) {
            for (
                let column = 1;
                column < columns;
                column++
            ) {
                if (
                    b[row - 1] ===
                    a[column - 1]
                ) {
                    matrix[row][column] =
                        matrix[
                            row - 1
                        ][
                            column - 1
                        ];

                } else {
                    matrix[row][column] =
                        Math.min(
                            matrix[
                                row - 1
                            ][
                                column - 1
                            ],

                            matrix[
                                row
                            ][
                                column - 1
                            ],

                            matrix[
                                row - 1
                            ][
                                column
                            ]
                        ) + 1;
                }
            }
        }

        return (
            Math.max(
                a.length,
                b.length
            )
            -
            matrix[
                b.length
            ][
                a.length
            ]
        ) /
        Math.max(
            a.length,
            b.length,
            1
        );
    }


    function yesValue(value) {
        return [
            "yes",
            "true",
            "1",
            "applicable",
            "available",
            "approved"
        ].includes(
            compact(value)
        );
    }


    function escapeHtml(value) {
        return String(value || "")
            .replaceAll(
                "&",
                "&amp;"
            )
            .replaceAll(
                "<",
                "&lt;"
            )
            .replaceAll(
                ">",
                "&gt;"
            );
    }


    function cssEscape(value) {
        if (
            window.CSS?.escape
        ) {
            return window.CSS.escape(
                value
            );
        }

        return String(value)
            .replace(
                /["\\]/g,
                "\\$&"
            );
    }


    function pad2(value) {
        return String(value)
            .padStart(2, "0");
    }


    function delay(ms) {
        return new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    ms
                )
        );
    }
})();