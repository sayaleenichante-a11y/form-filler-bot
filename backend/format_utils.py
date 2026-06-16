import re
from datetime import datetime
from difflib import SequenceMatcher


def clean_value(value, max_len=2000):
    if value is None:
        return ""

    if isinstance(value, float) and value.is_integer():
        value = int(value)

    text = re.sub(r"\s+", " ", str(value)).strip()
    return text[:max_len]


def normalize_text(value):
    text = clean_value(value).lower()

    replacements = {
        "µ": "micro",
        "μ": "micro",
        "m³": "m3",
        "₹": " rupees ",
        "_": " ",
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)
    text = re.sub(r"[^a-z0-9@.+/% -]+", " ", text)

    return re.sub(r"\s+", " ", text).strip()


def compact(value):
    return re.sub(
        r"[^a-z0-9.]+",
        "",
        normalize_text(value)
    )


def similarity(a, b):
    a = normalize_text(a)
    b = normalize_text(b)

    if not a or not b:
        return 0.0

    if a == b:
        return 1.0

    if a in b or b in a:
        return 0.92

    a_words = set(a.split())
    b_words = set(b.split())

    token_score = (
        len(a_words & b_words)
        / max(len(a_words), len(b_words), 1)
    )

    sequence_score = SequenceMatcher(
        None,
        a,
        b
    ).ratio()

    return max(
        token_score,
        sequence_score
    )


def field_descriptor(field):
    keys = (
        "label",
        "name",
        "id",
        "placeholder",
        "ariaLabel",
        "title",
        "autocomplete",
        "nearText",
        "sectionTitle",
        "tableLabel",
        "type"
    )

    return normalize_text(
        " ".join(
            str(field.get(key, "") or "")
            for key in keys
        )
    )


MONTHS = {
    "january": 1,
    "jan": 1,
    "february": 2,
    "feb": 2,
    "march": 3,
    "mar": 3,
    "april": 4,
    "apr": 4,
    "may": 5,
    "june": 6,
    "jun": 6,
    "july": 7,
    "jul": 7,
    "august": 8,
    "aug": 8,
    "september": 9,
    "sep": 9,
    "sept": 9,
    "october": 10,
    "oct": 10,
    "november": 11,
    "nov": 11,
    "december": 12,
    "dec": 12,
}


def normalize_date(value):
    text = clean_value(value)

    if not text:
        return ""

    # yyyy-mm-dd / yyyy/mm/dd / yyyy.mm.dd
    match = re.search(
        r"\b(19\d{2}|20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b",
        text
    )

    if match:
        year, month, day = map(
            int,
            match.groups()
        )

        try:
            return datetime(
                year,
                month,
                day
            ).strftime("%Y-%m-%d")

        except ValueError:
            return ""

    # dd-mm-yyyy / dd/mm/yyyy / dd.mm.yyyy
    match = re.search(
        r"\b(\d{1,2})[-/.](\d{1,2})[-/.](19\d{2}|20\d{2})\b",
        text
    )

    if match:
        day, month, year = map(
            int,
            match.groups()
        )

        try:
            return datetime(
                year,
                month,
                day
            ).strftime("%Y-%m-%d")

        except ValueError:
            return ""

    lower = text.lower()

    # 15 February 2026
    match = re.search(
        r"\b(\d{1,2})\s+([a-z]+)\s+(19\d{2}|20\d{2})\b",
        lower
    )

    if match and match.group(2) in MONTHS:
        try:
            return datetime(
                int(match.group(3)),
                MONTHS[match.group(2)],
                int(match.group(1))
            ).strftime("%Y-%m-%d")

        except ValueError:
            return ""

    # February 15, 2026
    match = re.search(
        r"\b([a-z]+)\s+(\d{1,2}),?\s+(19\d{2}|20\d{2})\b",
        lower
    )

    if match and match.group(1) in MONTHS:
        try:
            return datetime(
                int(match.group(3)),
                MONTHS[match.group(1)],
                int(match.group(2))
            ).strftime("%Y-%m-%d")

        except ValueError:
            return ""

    return ""


def normalize_time(value):
    text = clean_value(value)

    match = re.search(
        r"\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?\b",
        text,
        re.I
    )

    if not match:
        return ""

    hour = int(match.group(1))
    minute = int(match.group(2))
    marker = (match.group(3) or "").lower()

    if marker == "pm" and hour < 12:
        hour += 12

    if marker == "am" and hour == 12:
        hour = 0

    if hour > 23 or minute > 59:
        return ""

    return f"{hour:02d}:{minute:02d}"


def normalize_number(value):
    text = clean_value(value)

    text = (
        text
        .replace(",", "")
        .replace("₹", "")
        .replace("$", "")
        .replace("/-", "")
        .replace("%", "")
    )

    text = re.sub(
        r"\b(?:rs\.?|inr)\b",
        "",
        text,
        flags=re.I
    )

    match = re.search(
        r"-?\d+(?:\.\d+)?",
        text
    )

    return match.group(0) if match else ""


def normalize_percentage(value):
    number = normalize_number(value)

    if not number:
        return ""

    result = float(number)

    if result <= 1 and "%" not in clean_value(value):
        result *= 100

    if result.is_integer():
        return str(int(result))

    return str(round(result, 2))


def normalize_cgpa(value):
    number = normalize_number(value)

    if not number:
        return ""

    result = float(number)

    if result.is_integer():
        return str(int(result))

    return str(round(result, 2))


def normalize_salary(value, label=""):
    text = normalize_text(value)
    number = normalize_number(value)

    if not number:
        return ""

    amount = float(number)

    if re.search(
        r"\b(?:lpa|lakh|lakhs|lac|lacs)\b",
        text
    ):
        amount *= 100000

    elif re.search(
        r"\b(?:crore|crores|cr)\b",
        text
    ):
        amount *= 10000000

    elif re.search(
        r"\b(?:thousand|k)\b",
        text
    ):
        amount *= 1000

    source_monthly = any(
        term in text
        for term in (
            "per month",
            "monthly",
            "/month",
            "p m"
        )
    )

    source_annual = any(
        term in text
        for term in (
            "per annum",
            "annual",
            "yearly",
            "lpa",
            "p a"
        )
    )

    target = normalize_text(label)

    target_monthly = any(
        term in target
        for term in (
            "monthly",
            "per month"
        )
    )

    target_annual = any(
        term in target
        for term in (
            "annual",
            "yearly",
            "ctc",
            "package",
            "per annum"
        )
    )

    if source_monthly and target_annual:
        amount *= 12

    elif source_annual and target_monthly:
        amount /= 12

    if amount.is_integer():
        return str(int(amount))

    return str(round(amount, 2))


def normalize_email(value):
    match = re.search(
        r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
        clean_value(value)
    )

    return match.group(0) if match else ""


def normalize_phone(value):
    text = clean_value(value)

    match = re.search(
        r"(?:\+?91[\s-]*)?[6-9]\d{9}|\+?\d[\d\s()\-]{7,}\d",
        text
    )

    if not match:
        return ""

    phone = re.sub(
        r"[^\d+]",
        "",
        match.group(0)
    )

    if phone.startswith("91") and len(phone) == 12:
        return phone[2:]

    return phone


def normalize_url(value):
    text = clean_value(value)

    if not text:
        return ""

    if text.startswith(
        ("http://", "https://")
    ):
        return text

    if (
        text.startswith("www.")
        or re.match(
            r"^[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
            text
        )
    ):
        return "https://" + text

    return text


def normalize_boolean(value):
    text = compact(value)

    if text in {
        "yes",
        "true",
        "y",
        "1",
        "applicable",
        "available",
        "approved",
        "required"
    }:
        return "Yes"

    if text in {
        "no",
        "false",
        "n",
        "0",
        "notavailable",
        "notrequired"
    }:
        return "No"

    if text in {
        "na",
        "notapplicable",
        "none"
    }:
        return "Not Applicable"

    return clean_value(value)


ABBREVIATION_GROUPS = [
    {
        "be",
        "bachelorofengineering"
    },
    {
        "btech",
        "bacheloroftechnology"
    },
    {
        "mtech",
        "masteroftechnology"
    },
    {
        "mca",
        "masterofcomputerapplications"
    },
    {
        "bca",
        "bachelorofcomputerapplications"
    },
    {
        "mba",
        "masterofbusinessadministration"
    },
    {
        "cse",
        "computerscienceengineering",
        "computerscienceandengineering"
    },
    {
        "ce",
        "computerengineering"
    },
    {
        "it",
        "informationtechnology"
    },
    {
        "yes",
        "applicable",
        "true"
    },
    {
        "no",
        "false"
    },
    {
        "na",
        "notapplicable"
    },
    {
        "microgramperm3",
        "microgrampercubicmeter",
        "microgrampercubicmetre",
        "ugm3"
    },
]


def equivalent_compacts(value):
    base = compact(value)
    values = {base}

    for group in ABBREVIATION_GROUPS:
        matched = base in group

        if not matched:
            for item in group:
                if (
                    len(item) >= 4
                    and (
                        item in base
                        or base in item
                    )
                ):
                    matched = True
                    break

        if matched:
            values.update(group)

    return {
        item
        for item in values
        if item
    }


def option_text(option):
    if isinstance(option, dict):
        return clean_value(
            option.get("text")
            or option.get("label")
            or option.get("value")
        )

    return clean_value(option)


def option_value(option):
    if isinstance(option, dict):
        return clean_value(
            option.get("value")
            or option.get("text")
        )

    return clean_value(option)


def choose_select_value(
    value,
    options,
    field_label=""
):
    if not options:
        return clean_value(value)

    value_variants = equivalent_compacts(value)

    boolean_variant = normalize_boolean(value)

    value_variants.update(
        equivalent_compacts(
            boolean_variant
        )
    )

    best_output = ""
    best_score = 0.0

    for option in options:
        text = option_text(option)
        stored = option_value(option)

        combined = f"{text} {stored}".strip()

        option_compacts = equivalent_compacts(
            combined
        )

        if (
            not option_compacts
            or compact(combined) in {
                "select",
                "choose",
                "pleasechoose",
                "selectoption"
            }
        ):
            continue

        if value_variants & option_compacts:
            score = 1.0

        else:
            score = similarity(
                value,
                combined
            )

            if any(
                a in b or b in a
                for a in value_variants
                for b in option_compacts
            ):
                score = max(
                    score,
                    0.92
                )

        if score > best_score:
            best_score = score
            best_output = text or stored

    if best_score >= 0.55:
        return best_output

    return clean_value(value)


def format_value_for_field(value, field):
    text = clean_value(value)

    if not text:
        return ""

    descriptor = field_descriptor(field)

    field_type = normalize_text(
        field.get("type", "")
    )

    tag = normalize_text(
        field.get("tag", "")
    )

    if (
        tag == "select"
        or field_type == "select"
    ):
        return choose_select_value(
            text,
            field.get("options", []),
            descriptor
        )

    if (
        field_type == "date"
        or "date" in descriptor
        or "dob" in descriptor
    ):
        return normalize_date(text) or text

    if field_type == "month":
        date_value = normalize_date(text)

        return (
            date_value[:7]
            if date_value
            else text
        )

    if field_type == "time":
        return normalize_time(text) or text

    if (
        field_type == "email"
        or "email" in descriptor
        or "mail id" in descriptor
    ):
        return normalize_email(text) or text

    if (
        field_type == "tel"
        or any(
            term in descriptor
            for term in (
                "phone",
                "mobile",
                "contact",
                "telephone"
            )
        )
    ):
        return normalize_phone(text) or text

    if (
        field_type == "url"
        or any(
            term in descriptor
            for term in (
                "url",
                "website",
                "portfolio",
                "linkedin",
                "github"
            )
        )
    ):
        return normalize_url(text)

    if any(
        term in descriptor
        for term in (
            "salary",
            "ctc",
            "package",
            "stipend",
            "income"
        )
    ):
        return normalize_salary(
            text,
            descriptor
        ) or text

    if any(
        term in descriptor
        for term in (
            "percentage",
            "percent",
            "marks"
        )
    ):
        return normalize_percentage(text) or text

    if (
        "cgpa" in descriptor
        or "gpa" in descriptor
    ):
        return normalize_cgpa(text) or text

    if (
        field_type in {
            "number",
            "range"
        }
        or any(
            term in descriptor
            for term in (
                "amount",
                "quantity",
                "capacity",
                "area",
                "cost",
                "baseline",
                "incremental",
                "total",
                "standard",
                "degree",
                "minute",
                "second",
                "year",
                "pincode"
            )
        )
    ):
        return normalize_number(text) or text

    if any(
        term in descriptor
        for term in (
            "whether",
            "applicable",
            "approved",
            "available",
            "required"
        )
    ):
        return normalize_boolean(text)

    return text